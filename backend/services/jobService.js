const Job = require('../models/Job');
const storageService = require('./storageService');
const { analyzeAndTag } = require('./analysisService');
const { createEmbeddings } = require('./embeddingService');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class JobService {
  constructor() {
    this.activeJobs = new Map(); // Track active jobs for progress updates
  }

  // Create new crawler job
  async createJob(websiteUrl) {
    try {
      const jobId = Job.generateJobId();
      const job = new Job({
        jobId,
        websiteUrl,
        stage: 'discovery',
        status: 'running',
        progress: 0
      });

      await job.save();
      console.log(`Created job ${jobId} for ${websiteUrl}`);
      return job;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  // Start discovery stage
  async startDiscovery(jobId) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) {
        throw new Error('Job not found');
      }

      this.activeJobs.set(jobId, job);
      
      // Update job status
      job.stage = 'discovery';
      job.status = 'running';
      job.progress = 0;
      await job.save();

      console.log(`Starting discovery for job ${jobId}`);

      // Start discovery process
      this.runDiscovery(jobId, job.websiteUrl);
      
      return { success: true, message: 'Discovery started' };
    } catch (error) {
      console.error('Error starting discovery:', error);
      throw error;
    }
  }

  // Run discovery stage
  async runDiscovery(jobId, websiteUrl) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) return;

      console.log(`Running discovery for ${websiteUrl}`);

      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // Navigate to website
      await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Update progress
      await this.updateJobProgress(jobId, 20);

      // Extract all links and resources
      const resources = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const resources = [];

        links.forEach((link, index) => {
          const url = link.href;
          const title = link.textContent?.trim() || link.title || `Resource ${index + 1}`;
          const description = link.getAttribute('aria-label') || link.title || '';

          // Determine importance based on various factors
          let importance = 1;
          if (url.toLowerCase().includes('.pdf')) importance += 5;
          if (url.toLowerCase().includes('form')) importance += 3;
          if (url.toLowerCase().includes('instruction')) importance += 3;
          if (url.toLowerCase().includes('publication')) importance += 2;
          if (title.toLowerCase().includes('form')) importance += 2;
          if (title.toLowerCase().includes('instruction')) importance += 2;

          // Determine category
          let category = 'other';
          if (url.toLowerCase().includes('.pdf')) category = 'document';
          if (url.toLowerCase().includes('form')) category = 'form';
          if (url.toLowerCase().includes('instruction')) category = 'instruction';
          if (url.toLowerCase().includes('publication')) category = 'publication';

          resources.push({
            url,
            title,
            description,
            importance,
            category,
            dependencies: []
          });
        });

        return resources;
      });

      await browser.close();

      // Update progress
      await this.updateJobProgress(jobId, 60);

      // Sort by importance
      resources.sort((a, b) => b.importance - a.importance);

      // Build dependency tree (simplified)
      const dependencyTree = this.buildDependencyTree(resources);

      // Update progress
      await this.updateJobProgress(jobId, 100);

      // Update job with discovery results
      job.discoveryResults = {
        resources: resources.slice(0, 100), // Limit to top 100
        dependencyTree,
        totalResources: resources.length
      };
      job.stage = 'preparation';
      job.status = 'paused'; // Wait for admin input
      job.progress = 100;
      await job.save();

      this.activeJobs.delete(jobId);
      console.log(`Discovery completed for job ${jobId}: ${resources.length} resources found`);

    } catch (error) {
      console.error(`Error in discovery for job ${jobId}:`, error);
      await this.handleJobError(jobId, error.message);
    }
  }

  // Build dependency tree
  buildDependencyTree(resources) {
    const tree = {};
    
    resources.forEach(resource => {
      const category = resource.category;
      if (!tree[category]) {
        tree[category] = [];
      }
      tree[category].push({
        url: resource.url,
        title: resource.title,
        importance: resource.importance
      });
    });

    return tree;
  }

  // Start preparation stage
  async startPreparation(jobId, selectedResources) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) {
        throw new Error('Job not found');
      }

      this.activeJobs.set(jobId, job);
      
      // Update job status
      job.stage = 'preparation';
      job.status = 'running';
      job.progress = 0;
      await job.save();

      console.log(`Starting preparation for job ${jobId}`);

      // Start preparation process
      this.runPreparation(jobId, selectedResources);
      
      return { success: true, message: 'Preparation started' };
    } catch (error) {
      console.error('Error starting preparation:', error);
      throw error;
    }
  }

  // Run preparation stage
  async runPreparation(jobId, selectedResources) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) return;

      console.log(`Running preparation for job ${jobId}`);

      const downloadableResources = [];
      let processedCount = 0;

      for (const resource of selectedResources) {
        try {
          // Update progress
          const progress = Math.round((processedCount / selectedResources.length) * 80);
          await this.updateJobProgress(jobId, progress);

          // Check if resource is downloadable
          const isDownloadable = await this.checkIfDownloadable(resource.url);
          
          if (isDownloadable) {
            // Get metadata
            const metadata = await this.getResourceMetadata(resource.url);
            
            downloadableResources.push({
              ...resource,
              ...metadata,
              originalLink: resource.url
            });
          }

          processedCount++;
        } catch (error) {
          console.error(`Error processing resource ${resource.url}:`, error);
        }
      }

      // Update progress
      await this.updateJobProgress(jobId, 100);

      // Update job with preparation results
      job.preparationResults = {
        downloadableResources,
        totalDownloadable: downloadableResources.length
      };
      job.stage = 'selection';
      job.status = 'paused'; // Wait for admin input
      job.progress = 100;
      await job.save();

      this.activeJobs.delete(jobId);
      console.log(`Preparation completed for job ${jobId}: ${downloadableResources.length} downloadable resources`);

    } catch (error) {
      console.error(`Error in preparation for job ${jobId}:`, error);
      await this.handleJobError(jobId, error.message);
    }
  }

  // Check if URL is downloadable
  async checkIfDownloadable(url) {
    try {
      const response = await axios.head(url, { timeout: 10000 });
      const contentType = response.headers['content-type'] || '';
      const contentLength = response.headers['content-length'];
      
      // Check if it's a downloadable file
      const downloadableTypes = [
        'application/pdf',
        'application/octet-stream',
        'text/plain',
        'application/xml',
        'text/html'
      ];

      return downloadableTypes.some(type => contentType.includes(type)) || 
             url.toLowerCase().includes('.pdf') ||
             url.toLowerCase().includes('.txt') ||
             url.toLowerCase().includes('.xml');
    } catch (error) {
      return false;
    }
  }

  // Get resource metadata
  async getResourceMetadata(url) {
    try {
      const response = await axios.head(url, { timeout: 10000 });
      
      const filename = url.split('/').pop() || 'unknown';
      const fileType = filename.split('.').pop() || 'unknown';
      const fileSize = parseInt(response.headers['content-length']) || 0;

      return {
        name: filename,
        fileType: fileType.toLowerCase(),
        fileSize,
        metadata: {
          contentType: response.headers['content-type'],
          lastModified: response.headers['last-modified'],
          etag: response.headers['etag']
        }
      };
    } catch (error) {
      return {
        name: url.split('/').pop() || 'unknown',
        fileType: 'unknown',
        fileSize: 0,
        metadata: {}
      };
    }
  }

  // Start selection stage (download and process)
  async startSelection(jobId, selectedResources) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) {
        throw new Error('Job not found');
      }

      this.activeJobs.set(jobId, job);
      
      // Update job status
      job.stage = 'selection';
      job.status = 'running';
      job.progress = 0;
      job.selectionResults = {
        selectedResources: selectedResources.map(resource => ({
          ...resource,
          status: 'pending'
        })),
        totalSelected: selectedResources.length,
        downloadedCount: 0,
        processedCount: 0,
        embeddedCount: 0
      };
      await job.save();

      console.log(`Starting selection for job ${jobId}`);

      // Start download and processing
      this.runSelection(jobId, selectedResources);
      
      return { success: true, message: 'Selection started' };
    } catch (error) {
      console.error('Error starting selection:', error);
      throw error;
    }
  }

  // Run selection stage
  async runSelection(jobId, selectedResources) {
    try {
      const job = await Job.findOne({ jobId });
      if (!job) return;

      console.log(`Running selection for job ${jobId}`);

      let downloadedCount = 0;
      let processedCount = 0;
      let embeddedCount = 0;

      for (let i = 0; i < selectedResources.length; i++) {
        const resource = selectedResources[i];
        
        try {
          // Update progress
          const progress = Math.round((i / selectedResources.length) * 100);
          await this.updateJobProgress(jobId, progress);

          // Download file
          console.log(`Downloading ${resource.url}`);
          const downloadResult = await this.downloadResource(resource);
          
          if (downloadResult.success) {
            downloadedCount++;
            
            // Update job with download result
            job.selectionResults.selectedResources[i].localPath = downloadResult.localPath;
            job.selectionResults.selectedResources[i].status = 'downloaded';
            job.selectionResults.downloadedCount = downloadedCount;
            await job.save();

            // Process file (extract text)
            console.log(`Processing ${resource.name}`);
            const processResult = await this.processResource(downloadResult.localPath, resource);
            
            if (processResult.success) {
              processedCount++;
              job.selectionResults.selectedResources[i].status = 'processed';
              job.selectionResults.processedCount = processedCount;
              await job.save();

              // Create embeddings
              console.log(`Creating embeddings for ${resource.name}`);
              const embedResult = await this.embedResource(processResult.content, resource);
              
              if (embedResult.success) {
                embeddedCount++;
                job.selectionResults.selectedResources[i].status = 'embedded';
                job.selectionResults.embeddedCount = embeddedCount;
                await job.save();
              }
            }
          }

        } catch (error) {
          console.error(`Error processing resource ${resource.url}:`, error);
          job.selectionResults.selectedResources[i].status = 'error';
          await job.save();
        }
      }

      // Mark job as completed
      job.stage = 'completed';
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      await job.save();

      this.activeJobs.delete(jobId);
      console.log(`Selection completed for job ${jobId}: ${downloadedCount} downloaded, ${processedCount} processed, ${embeddedCount} embedded`);

    } catch (error) {
      console.error(`Error in selection for job ${jobId}:`, error);
      await this.handleJobError(jobId, error.message);
    }
  }

  // Download resource
  async downloadResource(resource) {
    try {
      const response = await axios({
        method: 'GET',
        url: resource.url,
        responseType: 'arraybuffer',
        timeout: 60000
      });

      const fileBuffer = Buffer.from(response.data);
      const filename = resource.name || resource.url.split('/').pop();

      // Store in local storage
      const storageResult = await storageService.storeFile(
        resource.url,
        fileBuffer,
        filename,
        {
          originalTitle: resource.title,
          originalDescription: resource.description,
          category: resource.category
        }
      );

      return {
        success: true,
        localPath: storageResult.key,
        fileSize: fileBuffer.length
      };
    } catch (error) {
      console.error(`Error downloading ${resource.url}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Process resource (extract text)
  async processResource(localPath, resource) {
    try {
      const fileData = await storageService.getFile(localPath);
      const fileBuffer = fileData.fileBuffer;
      
      // Extract text based on file type
      let content = '';
      
      if (resource.fileType === 'pdf') {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(fileBuffer);
        content = pdfData.text;
      } else if (resource.fileType === 'txt' || resource.fileType === 'html') {
        content = fileBuffer.toString('utf-8');
      } else {
        content = `[Binary file: ${resource.name}]`;
      }

      return {
        success: true,
        content,
        contentLength: content.length
      };
    } catch (error) {
      console.error(`Error processing ${resource.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Embed resource
  async embedResource(content, resource) {
    try {
      // Create embedding using the embedding service
      const embeddingResult = await createEmbeddings([{
        content,
        title: resource.title,
        source: resource.url,
        metadata: {
          filename: resource.name,
          category: resource.category
        }
      }]);

      return {
        success: true,
        embeddingId: embeddingResult.embeddingIds?.[0]
      };
    } catch (error) {
      console.error(`Error embedding ${resource.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Update job progress
  async updateJobProgress(jobId, progress) {
    try {
      await Job.findOneAndUpdate(
        { jobId },
        { progress, updatedAt: new Date() }
      );
    } catch (error) {
      console.error(`Error updating progress for job ${jobId}:`, error);
    }
  }

  // Handle job error
  async handleJobError(jobId, errorMessage) {
    try {
      await Job.findOneAndUpdate(
        { jobId },
        {
          status: 'error',
          errorMessage,
          updatedAt: new Date()
        }
      );
      
      this.activeJobs.delete(jobId);
    } catch (error) {
      console.error(`Error handling error for job ${jobId}:`, error);
    }
  }

  // Get job status
  async getJobStatus(jobId) {
    try {
      const job = await Job.findOne({ jobId });
      return job;
    } catch (error) {
      console.error(`Error getting job status for ${jobId}:`, error);
      throw error;
    }
  }

  // Get all jobs
  async getAllJobs() {
    try {
      const jobs = await Job.find().sort({ createdAt: -1 });
      return jobs;
    } catch (error) {
      console.error('Error getting all jobs:', error);
      throw error;
    }
  }

  // Delete job
  async deleteJob(jobId) {
    try {
      const job = await Job.findOneAndDelete({ jobId });
      this.activeJobs.delete(jobId);
      return job;
    } catch (error) {
      console.error(`Error deleting job ${jobId}:`, error);
      throw error;
    }
  }
}

module.exports = new JobService(); 