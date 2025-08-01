import asyncio
import logging
from pathlib import Path
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class IRSFormsScraper:
    def __init__(self, download_dir="irs_pdfs", filter_important_only=True):
        self.base_url = "https://www.irs.gov"
        self.forms_url = "https://www.irs.gov/forms-instructions-and-publications"
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(exist_ok=True)
        self.metadata_file = self.download_dir / "metadata.csv"
        self.filter_important_only = filter_important_only
        self.total_forms_found = 0
        self.important_forms_found = 0
        self.downloaded_count = 0
        
    def is_important_form(self, form_info):
        """Filter important forms for tax GPT training"""
        product_number = form_info['product_number'].lower()
        title = form_info['title'].lower()
        
        # Filter out non-English versions
        # usually have "Version" or "version" in parentheses
        if 'version)' in title or \
            'Version' in title or \
            'Spanish' in title or \
            'Chinese' in title or \
            'Vietnamese' in title:
            return False
        
        # Core individual tax forms
        if any(product_number.startswith(prefix) \
           for prefix in ['1040', 'w-2', 'w-4', '1099']):
            return True
        
        # Business forms
        if any(product_number.startswith(prefix) \
           for prefix in ['1120', '1065', '1041', '941', '940']):
            return True
        
        # Schedules
        if 'schedule' in product_number or \
           'schedule' in title:
            return True
        
        # Key publications
        important_pubs = ['publication 17', 'publication 334', 'publication 535', 
                         'publication 946', 'publication 970', 'publication 523', 'publication 936']
        if any(pub in title for pub in important_pubs):
            return True
        
        # Instructions
        if 'instructions for form' in title or \
           'instructions for schedule' in title:
            return True
        
        return False
        
    async def scrape_all_pages(self, max_pages=None):
        """Scrape all pages of IRS forms and publications"""
        async with async_playwright() as p:
            # Launch browser with download settings
            browser = await p.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled']
            )
            
            context = await browser.new_context(
                accept_downloads=True,
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            all_forms_data = []
            current_page = 1
            
            try:
                while True:
                    if max_pages and current_page > max_pages:
                        logger.info(f"Reached maximum pages limit ({max_pages})")
                        break
                        
                    logger.info(f"Scraping page {current_page}...")
                    
                    # Navigate to the forms page (or next page)
                    if current_page == 1:
                        await page.goto(self.forms_url, wait_until='networkidle')
                    else:
                        # Click next page link
                        try:
                            next_link = await page.wait_for_selector('a[title="Go to next page"]', timeout=10000)
                            if next_link:
                                await next_link.click()
                                await page.wait_for_load_state('networkidle')
                                logger.info(f"Navigated to page {current_page}")
                            else:
                                logger.info("No next page found - reached end")
                                break
                        except Exception as e:
                            logger.info(f"No next page found: {e}")
                            break
                    
                    # Wait for the table to load
                    try:
                        await page.wait_for_selector('table', timeout=30000)
                    except Exception as e:
                        logger.error(f"Table not found on page {current_page}: {e}")
                        break
                    
                    # Get the page content
                    content = await page.content()
                    soup = BeautifulSoup(content, 'html.parser')
                    
                    # Find the main table with forms
                    table = soup.find('table')
                    if not table:
                        logger.warning(f"No table found on page {current_page}")
                        break
                    
                    page_forms_data = []
                    rows = table.find_all('tr')[1:]  # Skip header row
                    
                    logger.info(f"Found {len(rows)} forms on page {current_page}")
                    
                    for idx, row in enumerate(rows):
                        try:
                            form_info = self.extract_form_info(row)
                            if form_info:
                                self.total_forms_found += 1
                                
                                # Check if form is important
                                if self.filter_important_only and not self.is_important_form(form_info):
                                    logger.debug(f"Skipping non-important form: {form_info['product_number']}")
                                    continue
                                
                                self.important_forms_found += 1
                                page_forms_data.append(form_info)
                                
                                # Download PDF with delay (respecting rate limits)
                                if form_info['pdf_url'] and form_info['pdf_url'].endswith('.pdf'):
                                    await self.download_pdf(page, form_info, idx)
                                    # Wait 1-3 seconds between downloads
                                    await asyncio.sleep(1 + (idx % 3))
                                    
                        except Exception as e:
                            logger.error(f"Error processing row {idx} on page {current_page}: {str(e)}")
                            continue
                    
                    all_forms_data.extend(page_forms_data)
                    logger.info(f"Page {current_page} complete. Total forms so far: {len(all_forms_data)}")
                    
                    current_page += 1
                    
                    # Add delay between pages
                    await asyncio.sleep(2)
                    
            except Exception as e:
                logger.error(f"Error during scraping: {e}")
            finally:
                await browser.close()
            
            # Save metadata
            self.save_metadata(all_forms_data)
            
            return all_forms_data
    
    def extract_form_info(self, row):
        """Extract form information from a table row"""
        try:
            cells = row.find_all('td')
            if len(cells) < 4:
                return None
            
            # Extract data from cells
            product_cell = cells[0]
            title_cell = cells[1]
            revision_date_cell = cells[2]
            posted_date_cell = cells[3]
            
            # Find the link in the product cell
            # Look for span with class 'tablesaw-cell-content' first
            span_elem = product_cell.find('span', class_='tablesaw-cell-content')
            if span_elem:
                link_elem = span_elem.find('a')
            else:
                # Fallback to direct link search
                link_elem = product_cell.find('a')
            
            if not link_elem:
                return None
            
            product_number = link_elem.text.strip()
            pdf_url = link_elem.get('href', '')
            
            # Make absolute URL if relative
            if pdf_url and not pdf_url.startswith('http'):
                pdf_url = self.base_url + pdf_url
            
            return {
                'product_number': product_number,
                'title': title_cell.text.strip(),
                'revision_date': revision_date_cell.text.strip(),
                'posted_date': posted_date_cell.text.strip(),
                'pdf_url': pdf_url,
                'filename': pdf_url.split('/')[-1] if pdf_url else '',
                'scraped_date': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error extracting form info: {e}")
            return None
    
    async def download_pdf(self, page, form_info, index):
        """Download a single PDF file"""
        try:
            pdf_url = form_info['pdf_url']
            filename = form_info['filename']
            
            if not filename:
                return
            
            filepath = self.download_dir / filename
            
            # Skip if already downloaded
            if filepath.exists():
                logger.info(f"[{index}] Already downloaded: {filename}")
                return
            
            logger.info(f"[{index}] Downloading: {filename}")
            
            # Navigate to PDF URL and download
            response = await page.request.get(pdf_url)
            if response.status == 200:
                content = await response.body()
                filepath.write_bytes(content)
                self.downloaded_count += 1
                logger.info(f"[{index}] Saved: {filename}")
            else:
                logger.error(f"[{index}] Failed to download {filename}: Status {response.status}")
                
        except Exception as e:
            logger.error(f"[{index}] Error downloading {form_info['product_number']}: {str(e)}")
    
    def save_metadata(self, forms_data):
        """Save form metadata to CSV"""
        if forms_data:
            df = pd.DataFrame(forms_data)
            df.to_csv(self.metadata_file, index=False)
            logger.info(f"Saved metadata for {len(forms_data)} forms to {self.metadata_file}")
    
    def load_existing_metadata(self):
        """Load existing metadata if available"""
        if self.metadata_file.exists():
            return pd.read_csv(self.metadata_file)
        return pd.DataFrame()
    
    def print_summary(self):
        """Print scraping summary"""
        logger.info("=" * 60)
        logger.info("SCRAPING SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total forms found: {self.total_forms_found}")
        logger.info(f"Important forms found: {self.important_forms_found}")
        logger.info(f"PDFs downloaded: {self.downloaded_count}")
        logger.info(f"Metadata saved to: {self.metadata_file}")
        logger.info("=" * 60)

async def main():
    """Main function to run the scraper"""
    logger.info("Starting IRS Forms scraper...")
    
    # Initialize scraper with filtering enabled
    scraper = IRSFormsScraper(
        download_dir="irs_pdfs", 
        filter_important_only=True  # Set to False to download all forms
    )
    
    # Scrape all pages (set max_pages=None for all pages, or a number to limit)
    forms = await scraper.scrape_all_pages(max_pages=5)  # Limit to 5 pages for testing
    
    # Print summary
    scraper.print_summary()
    
    # Display sample of important forms
    if forms:
        logger.info("\nSample of important forms scraped:")
        for form in forms[:10]:
            logger.info(f"- {form['product_number']}: {form['title']}")

if __name__ == "__main__":
    # Install required packages:
    # pip install playwright beautifulsoup4 pandas
    # playwright install chromium
    
    asyncio.run(main())