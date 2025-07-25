const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const UserProfile = require('../models/UserProfile');
const jobService = require('../services/jobService');
const storageService = require('../services/storageService');

// Get system overview and statistics
router.get('/overview', async (req, res) => {
  try {
    const [
      documentStats,
      chatStats,
      userStats,
      recentDocuments,
      recentChats
    ] = await Promise.all([
      Document.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Chat.aggregate([
        {
          $group: {
            _id: null,
            totalChats: { $sum: 1 },
            totalMessages: { $sum: { $size: '$messages' } }
          }
        }
      ]),
      UserProfile.countDocuments(),
      Document.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title formNumber status createdAt'),
      Chat.find()
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('sessionId title updatedAt messages')
    ]);

    const stats = {
      documents: documentStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      chats: chatStats[0] || { totalChats: 0, totalMessages: 0 },
      users: userStats,
      recentDocuments,
      recentChats: recentChats.map(chat => ({
        sessionId: chat.sessionId,
        title: chat.title,
        messageCount: chat.messages.length,
        updatedAt: chat.updatedAt
      }))
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: 'Failed to fetch admin overview' });
  }
});

// Test crawler with specific URL
router.post('/test-crawler', async (req, res) => {
  try {
    const { url, testType } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    let result;
    
    switch (testType) {
      case 'structure':
        // Test crawling structure
        result = await testCrawlerStructure(url);
        break;
      case 'download':
        // Test downloading a specific document
        result = await testDocumentDownload(url);
        break;
      case 'parse':
        // Test parsing a document
        result = await testDocumentParsing(url);
        break;
      default:
        return res.status(400).json({ error: 'Invalid test type' });
    }
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error testing crawler:', error);
    res.status(500).json({ error: 'Failed to test crawler' });
  }
});

// Create new crawler job
router.post('/jobs', async (req, res) => {
  try {
    const { websiteUrl } = req.body;
    
    if (!websiteUrl) {
      return res.status(400).json({ error: 'Website URL is required' });
    }
    
    const job = await jobService.createJob(websiteUrl);
    
    res.json({
      success: true,
      job: {
        jobId: job.jobId,
        websiteUrl: job.websiteUrl,
        stage: job.stage,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Start discovery stage
router.post('/jobs/:jobId/discovery', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const result = await jobService.startDiscovery(jobId);
    
    res.json(result);
  } catch (error) {
    console.error('Error starting discovery:', error);
    res.status(500).json({ error: 'Failed to start discovery' });
  }
});

// Start preparation stage
router.post('/jobs/:jobId/preparation', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { selectedResources } = req.body;
    
    if (!selectedResources || !Array.isArray(selectedResources)) {
      return res.status(400).json({ error: 'Selected resources array is required' });
    }
    
    const result = await jobService.startPreparation(jobId, selectedResources);
    
    res.json(result);
  } catch (error) {
    console.error('Error starting preparation:', error);
    res.status(500).json({ error: 'Failed to start preparation' });
  }
});

// Start selection stage
router.post('/jobs/:jobId/selection', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { selectedResources } = req.body;
    
    if (!selectedResources || !Array.isArray(selectedResources)) {
      return res.status(400).json({ error: 'Selected resources array is required' });
    }
    
    const result = await jobService.startSelection(jobId, selectedResources);
    
    res.json(result);
  } catch (error) {
    console.error('Error starting selection:', error);
    res.status(500).json({ error: 'Failed to start selection' });
  }
});

// Get job status
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await jobService.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      success: true,
      job: {
        jobId: job.jobId,
        websiteUrl: job.websiteUrl,
        stage: job.stage,
        status: job.status,
        progress: job.progress,
        discoveryResults: job.discoveryResults,
        preparationResults: job.preparationResults,
        selectionResults: job.selectionResults,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt
      }
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// Get all jobs
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await jobService.getAllJobs();
    
    res.json({
      success: true,
      jobs: jobs.map(job => ({
        jobId: job.jobId,
        websiteUrl: job.websiteUrl,
        stage: job.stage,
        status: job.status,
        progress: job.progress,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        // Include summary counts
        discoveryCount: job.discoveryResults?.totalResources || 0,
        preparationCount: job.preparationResults?.totalDownloadable || 0,
        selectionCount: job.selectionResults?.totalSelected || 0,
        downloadedCount: job.selectionResults?.downloadedCount || 0,
        processedCount: job.selectionResults?.processedCount || 0,
        embeddedCount: job.selectionResults?.embeddedCount || 0
      }))
    });
  } catch (error) {
    console.error('Error getting all jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Delete job
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await jobService.deleteJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Get detailed document information
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Update document manually
router.put('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const document = await Document.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await Document.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get system logs (mock implementation)
router.get('/logs', async (req, res) => {
  try {
    const { type = 'all', limit = 100 } = req.query;
    
    // Mock logs - in production, you'd want to implement proper logging
    const logs = [
      {
        timestamp: new Date(),
        level: 'info',
        message: 'Crawler started for IRS website',
        type: 'crawler'
      },
      {
        timestamp: new Date(Date.now() - 60000),
        level: 'info',
        message: 'Downloaded 5 PDF documents',
        type: 'download'
      },
      {
        timestamp: new Date(Date.now() - 120000),
        level: 'error',
        message: 'Failed to parse document: Form 1040',
        type: 'parser'
      }
    ];
    
    const filteredLogs = type === 'all' 
      ? logs 
      : logs.filter(log => log.type === type);
    
    res.json({
      success: true,
      logs: filteredLogs.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Clear all data (dangerous operation)
router.delete('/clear-data', async (req, res) => {
  try {
    const { type } = req.query;
    
    if (!type || !['documents', 'chats', 'users', 'all'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be documents, chats, users, or all' });
    }
    
    let result;
    
    switch (type) {
      case 'documents':
        result = await Document.deleteMany({});
        break;
      case 'chats':
        result = await Chat.deleteMany({});
        break;
      case 'users':
        result = await UserProfile.deleteMany({});
        break;
      case 'all':
        await Promise.all([
          Document.deleteMany({}),
          Chat.deleteMany({}),
          UserProfile.deleteMany({})
        ]);
        result = { deletedCount: 'all' };
        break;
    }
    
    res.json({
      success: true,
      message: `Cleared ${type} data successfully`,
      result
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// Get storage statistics
router.get('/storage/stats', async (req, res) => {
  try {
    const stats = await storageService.getStorageStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
});

// List stored files
router.get('/storage/files', async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    
    const files = await storageService.listFiles(prefix);
    
    res.json({
      success: true,
      files: files.map(file => ({
        key: file.key,
        filename: file.filename,
        fileSize: file.fileSize,
        contentType: file.contentType,
        originalUrl: file.originalUrl,
        createdAt: file.createdAt,
        lastModified: file.lastModified,
        metadata: file.metadata
      }))
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get file metadata
router.get('/storage/files/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const metadata = await storageService.getMetadata(key);
    
    res.json({
      success: true,
      metadata
    });
  } catch (error) {
    console.error('Error getting file metadata:', error);
    res.status(500).json({ error: 'Failed to get file metadata' });
  }
});

// Delete file
router.delete('/storage/files/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    await storageService.deleteFile(key);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get system status
router.get('/status', async (req, res) => {
  try {
    const [jobs, storageStats] = await Promise.all([
      jobService.getAllJobs(),
      storageService.getStorageStats()
    ]);
    
    const activeJobs = jobs.filter(job => job.status === 'running');
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const errorJobs = jobs.filter(job => job.status === 'error');
    
    res.json({
      success: true,
      status: {
        totalJobs: jobs.length,
        activeJobs: activeJobs.length,
        completedJobs: completedJobs.length,
        errorJobs: errorJobs.length,
        storage: storageStats
      }
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// Helper functions for testing
async function testCrawlerStructure(url) {
  // Mock implementation
  return {
    success: true,
    discoveredLinks: 25,
    pdfLinks: 10,
    structure: {
      categories: ['Forms', 'Instructions', 'Publications'],
      depth: 3,
      totalPages: 15
    }
  };
}

async function testDocumentDownload(url) {
  // Mock implementation
  return {
    success: true,
    downloaded: true,
    fileSize: '2.5MB',
    contentType: 'application/pdf'
  };
}

async function testDocumentParsing(url) {
  // Mock implementation
  return {
    success: true,
    parsed: true,
    pageCount: 8,
    extractedText: 'Sample extracted text...',
    metadata: {
      title: 'Form 1040',
      year: 2023,
      category: 'Individual Tax Forms'
    }
  };
}

module.exports = router; 