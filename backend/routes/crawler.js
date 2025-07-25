const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const { crawlWebsite, downloadDocuments, processDocuments } = require('../services/crawlerService');
const { analyzeAndTag } = require('../services/analysisService');
const { createEmbeddings } = require('../services/embeddingService');

// Start crawling a website
router.post('/start', async (req, res) => {
  try {
    const { baseUrl, categories, maxDepth = 3 } = req.body;
    
    if (!baseUrl) {
      return res.status(400).json({ error: 'Base URL is required' });
    }
    
    // Start crawling in background
    crawlWebsite(baseUrl, categories, maxDepth)
      .then(results => {
        console.log('Crawling completed:', results);
      })
      .catch(error => {
        console.error('Crawling failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Crawling started successfully',
      baseUrl,
      categories
    });
  } catch (error) {
    console.error('Error starting crawler:', error);
    res.status(500).json({ error: 'Failed to start crawler' });
  }
});

// Download documents from discovered URLs
router.post('/download', async (req, res) => {
  try {
    const { documentIds, force = false } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }
    
    // Start download in background
    downloadDocuments(documentIds, force)
      .then(results => {
        console.log('Download completed:', results);
      })
      .catch(error => {
        console.error('Download failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Download started successfully',
      documentCount: documentIds.length
    });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({ error: 'Failed to start download' });
  }
});

// Process downloaded documents (extract text, analyze, tag)
router.post('/process', async (req, res) => {
  try {
    const { documentIds, force = false } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }
    
    // Start processing in background
    processDocuments(documentIds, force)
      .then(results => {
        console.log('Processing completed:', results);
      })
      .catch(error => {
        console.error('Processing failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Processing started successfully',
      documentCount: documentIds.length
    });
  } catch (error) {
    console.error('Error starting processing:', error);
    res.status(500).json({ error: 'Failed to start processing' });
  }
});

// Analyze and tag documents
router.post('/analyze', async (req, res) => {
  try {
    const { documentIds, force = false } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }
    
    // Start analysis in background
    analyzeAndTag(documentIds, force)
      .then(results => {
        console.log('Analysis completed:', results);
      })
      .catch(error => {
        console.error('Analysis failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Analysis started successfully',
      documentCount: documentIds.length
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// Create embeddings for documents
router.post('/embed', async (req, res) => {
  try {
    const { documentIds, force = false } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }
    
    // Start embedding in background
    createEmbeddings(documentIds, force)
      .then(results => {
        console.log('Embedding completed:', results);
      })
      .catch(error => {
        console.error('Embedding failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Embedding started successfully',
      documentCount: documentIds.length
    });
  } catch (error) {
    console.error('Error starting embedding:', error);
    res.status(500).json({ error: 'Failed to start embedding' });
  }
});

// Get crawler status and statistics
router.get('/status', async (req, res) => {
  try {
    const stats = await Document.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const totalDocuments = await Document.countDocuments();
    const recentDocuments = await Document.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title formNumber status createdAt');
    
    res.json({
      success: true,
      stats: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      totalDocuments,
      recentDocuments
    });
  } catch (error) {
    console.error('Error fetching crawler status:', error);
    res.status(500).json({ error: 'Failed to fetch crawler status' });
  }
});

// Get documents by status
router.get('/documents/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const documents = await Document.find({ status })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('title formNumber year category status createdAt');
    
    const total = await Document.countDocuments({ status });
    
    res.json({
      success: true,
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Retry failed documents
router.post('/retry', async (req, res) => {
  try {
    const { documentIds } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }
    
    // Reset status to pending for retry
    await Document.updateMany(
      { _id: { $in: documentIds } },
      { 
        status: 'pending',
        errorMessage: null,
        updatedAt: new Date()
      }
    );
    
    res.json({
      success: true,
      message: 'Documents reset for retry',
      documentCount: documentIds.length
    });
  } catch (error) {
    console.error('Error retrying documents:', error);
    res.status(500).json({ error: 'Failed to retry documents' });
  }
});

module.exports = router; 