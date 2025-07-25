const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const Document = require('../models/Document');

// Crawl website structure
async function crawlWebsite(baseUrl, categories = [], maxDepth = 3) {
  console.log(`Starting crawl of ${baseUrl} with max depth ${maxDepth}`);
  
  const discoveredUrls = new Set();
  const pdfUrls = new Set();
  const visitedUrls = new Set();
  
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Start crawling from base URL
    await crawlPage(page, baseUrl, discoveredUrls, pdfUrls, visitedUrls, 0, maxDepth, categories);
    
    await browser.close();
    
    // Save discovered documents to database
    const documents = [];
    for (const pdfUrl of pdfUrls) {
      try {
        const document = await createDocumentFromUrl(pdfUrl, baseUrl);
        if (document) {
          documents.push(document);
        }
      } catch (error) {
        console.error(`Error creating document from ${pdfUrl}:`, error);
      }
    }
    
    console.log(`Crawl completed. Found ${discoveredUrls.size} URLs, ${pdfUrls.size} PDFs`);
    
    return {
      success: true,
      discoveredUrls: Array.from(discoveredUrls),
      pdfUrls: Array.from(pdfUrls),
      documentsCreated: documents.length
    };
    
  } catch (error) {
    console.error('Error during crawling:', error);
    throw error;
  }
}

// Recursively crawl pages
async function crawlPage(page, url, discoveredUrls, pdfUrls, visitedUrls, depth, maxDepth, categories) {
  if (depth > maxDepth || visitedUrls.has(url)) {
    return;
  }
  
  visitedUrls.add(url);
  console.log(`Crawling: ${url} (depth: ${depth})`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract all links
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors).map(a => a.href);
    });
    
    for (const link of links) {
      discoveredUrls.add(link);
      
      // Check if it's a PDF
      if (link.toLowerCase().includes('.pdf')) {
        pdfUrls.add(link);
        continue;
      }
      
      // Check if it's a relevant page to crawl deeper
      if (shouldCrawlDeeper(link, categories) && depth < maxDepth) {
        try {
          await crawlPage(page, link, discoveredUrls, pdfUrls, visitedUrls, depth + 1, maxDepth, categories);
        } catch (error) {
          console.error(`Error crawling ${link}:`, error);
        }
      }
    }
    
  } catch (error) {
    console.error(`Error crawling ${url}:`, error);
  }
}

// Check if URL should be crawled deeper
function shouldCrawlDeeper(url, categories) {
  const urlLower = url.toLowerCase();
  
  // If no categories specified, crawl all
  if (!categories || categories.length === 0) {
    return true;
  }
  
  // Check if URL matches any category
  return categories.some(category => 
    urlLower.includes(category.toLowerCase())
  );
}

// Create document record from URL
async function createDocumentFromUrl(pdfUrl, sourceUrl) {
  try {
    // Extract document info from URL
    const urlParts = pdfUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    
    // Parse form number and year from filename
    const formMatch = filename.match(/(\d{4})/);
    const year = formMatch ? parseInt(formMatch[1]) : new Date().getFullYear();
    
    // Extract form number (e.g., "1040" from "f1040.pdf")
    const formNumberMatch = filename.match(/f?(\d{3,4})/i);
    const formNumber = formNumberMatch ? formNumberMatch[1] : 'unknown';
    
    // Determine category from URL
    const category = determineCategory(pdfUrl);
    
    // Check if document already exists
    const existingDoc = await Document.findOne({ pdfUrl });
    if (existingDoc) {
      console.log(`Document already exists: ${filename}`);
      return existingDoc;
    }
    
    // Create new document
    const document = new Document({
      title: filename.replace('.pdf', '').replace(/f/i, 'Form '),
      formNumber,
      year,
      category,
      sourceUrl,
      pdfUrl,
      status: 'pending'
    });
    
    await document.save();
    console.log(`Created document: ${document.title}`);
    
    return document;
    
  } catch (error) {
    console.error(`Error creating document from ${pdfUrl}:`, error);
    return null;
  }
}

// Determine document category from URL
function determineCategory(url) {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('instruction')) return 'instructions';
  if (urlLower.includes('form')) return 'forms';
  if (urlLower.includes('publication')) return 'publications';
  if (urlLower.includes('schedule')) return 'schedules';
  if (urlLower.includes('worksheet')) return 'worksheets';
  
  return 'other';
}

// Download documents
async function downloadDocuments(documentIds, force = false) {
  console.log(`Starting download of ${documentIds.length} documents`);
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  for (const docId of documentIds) {
    try {
      const document = await Document.findById(docId);
      if (!document) {
        results.errors.push(`Document ${docId} not found`);
        results.failed++;
        continue;
      }
      
      // Skip if already downloaded and not forced
      if (document.status === 'downloaded' && !force) {
        results.skipped++;
        continue;
      }
      
      // Download the PDF
      await downloadDocument(document);
      results.success++;
      
    } catch (error) {
      console.error(`Error downloading document ${docId}:`, error);
      results.errors.push(`Document ${docId}: ${error.message}`);
      results.failed++;
      
      // Update document status to error
      await Document.findByIdAndUpdate(docId, {
        status: 'error',
        errorMessage: error.message,
        updatedAt: new Date()
      });
    }
  }
  
  console.log(`Download completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return results;
}

// Download a single document
async function downloadDocument(document) {
  try {
    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, '../downloads');
    await fs.mkdir(downloadsDir, { recursive: true });
    
    // Generate local filename
    const filename = `${document.formNumber}_${document.year}.pdf`;
    const localPath = path.join(downloadsDir, filename);
    
    // Download the file
    const response = await axios({
      method: 'GET',
      url: document.pdfUrl,
      responseType: 'stream',
      timeout: 60000
    });
    
    const writer = require('fs').createWriteStream(localPath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    // Get file stats
    const stats = await fs.stat(localPath);
    
    // Update document
    document.localPath = localPath;
    document.status = 'downloaded';
    document.metadata = {
      ...document.metadata,
      fileSize: stats.size,
      lastModified: new Date()
    };
    document.updatedAt = new Date();
    
    await document.save();
    
    console.log(`Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
  } catch (error) {
    console.error(`Error downloading ${document.title}:`, error);
    throw error;
  }
}

// Process downloaded documents
async function processDocuments(documentIds, force = false) {
  console.log(`Starting processing of ${documentIds.length} documents`);
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  for (const docId of documentIds) {
    try {
      const document = await Document.findById(docId);
      if (!document) {
        results.errors.push(`Document ${docId} not found`);
        results.failed++;
        continue;
      }
      
      // Skip if already processed and not forced
      if (document.status === 'processed' && !force) {
        results.skipped++;
        continue;
      }
      
      // Process the document
      await processDocument(document);
      results.success++;
      
    } catch (error) {
      console.error(`Error processing document ${docId}:`, error);
      results.errors.push(`Document ${docId}: ${error.message}`);
      results.failed++;
      
      // Update document status to error
      await Document.findByIdAndUpdate(docId, {
        status: 'error',
        errorMessage: error.message,
        updatedAt: new Date()
      });
    }
  }
  
  console.log(`Processing completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return results;
}

// Process a single document
async function processDocument(document) {
  try {
    if (!document.localPath) {
      throw new Error('Document not downloaded');
    }
    
    // Extract text from PDF
    const pdfParse = require('pdf-parse');
    const fs = require('fs');
    
    const dataBuffer = fs.readFileSync(document.localPath);
    const data = await pdfParse(dataBuffer);
    
    // Update document with extracted content
    document.content = data.text;
    document.metadata = {
      ...document.metadata,
      pageCount: data.numpages
    };
    document.status = 'processed';
    document.updatedAt = new Date();
    
    await document.save();
    
    console.log(`Processed: ${document.title} (${data.numpages} pages)`);
    
  } catch (error) {
    console.error(`Error processing ${document.title}:`, error);
    throw error;
  }
}

module.exports = {
  crawlWebsite,
  downloadDocuments,
  processDocuments
}; 