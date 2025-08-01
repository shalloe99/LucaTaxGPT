# IRS Forms Scraper

A Python scraper that downloads IRS forms and publications from the official IRS website.

## Features

- Scrapes IRS forms and publications from the first page
- Downloads PDF files automatically
- Saves metadata to CSV file
- Respects rate limits with delays between downloads
- Skips already downloaded files

## Setup

1. **Create virtual environment:**

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **Install Playwright browser:**
   ```bash
   playwright install chromium
   ```

## Usage

Run the scraper:

```bash
python3 main.py
```

The script will:

- Create an `irs_pdfs` directory
- Download PDF files to the directory
- Save metadata to `irs_pdfs/metadata.csv`

## Output

- **PDF files**: Downloaded to `irs_pdfs/` directory
- **Metadata**: Saved as `irs_pdfs/metadata.csv` with columns:
  - `product_number`: Form number (e.g., "1040")
  - `title`: Form title
  - `revision_date`: Form revision date
  - `posted_date`: Date posted on IRS website
  - `pdf_url`: Direct link to PDF
  - `filename`: Local filename
  - `scraped_date`: When the form was scraped

## Requirements

- Python 3.7+
- See `requirements.txt` for package dependencies
