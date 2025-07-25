const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class LocalStorageService {
  constructor() {
    this.baseDir = path.join(__dirname, '../storage');
    this.metadataDir = path.join(this.baseDir, 'metadata');
    this.filesDir = path.join(this.baseDir, 'files');
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(this.metadataDir, { recursive: true });
      await fs.mkdir(this.filesDir, { recursive: true });
      console.log('Local storage initialized');
    } catch (error) {
      console.error('Error initializing local storage:', error);
    }
  }

  // Generate S3-like key structure
  generateKey(originalUrl, filename) {
    const urlHash = crypto.createHash('md5').update(originalUrl).digest('hex');
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `documents/${year}/${month}/${day}/${urlHash}/${filename}`;
  }

  // Store file and metadata
  async storeFile(originalUrl, fileBuffer, filename, metadata = {}) {
    try {
      const key = this.generateKey(originalUrl, filename);
      const filePath = path.join(this.filesDir, key);
      const metadataPath = path.join(this.metadataDir, `${key}.json`);

      // Create directory structure
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.mkdir(path.dirname(metadataPath), { recursive: true });

      // Write file
      await fs.writeFile(filePath, fileBuffer);

      // Create metadata
      const fileStats = await fs.stat(filePath);
      const fileMetadata = {
        key,
        originalUrl,
        filename,
        fileSize: fileStats.size,
        contentType: this.getContentType(filename),
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        ...metadata
      };

      // Write metadata
      await fs.writeFile(metadataPath, JSON.stringify(fileMetadata, null, 2));

      return {
        key,
        filePath,
        metadataPath,
        metadata: fileMetadata
      };
    } catch (error) {
      console.error('Error storing file:', error);
      throw error;
    }
  }

  // Get file
  async getFile(key) {
    try {
      const filePath = path.join(this.filesDir, key);
      const metadataPath = path.join(this.metadataDir, `${key}.json`);

      const [fileBuffer, metadataBuffer] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(metadataPath)
      ]);

      const metadata = JSON.parse(metadataBuffer.toString());

      return {
        fileBuffer,
        metadata
      };
    } catch (error) {
      console.error('Error getting file:', error);
      throw error;
    }
  }

  // Get metadata only
  async getMetadata(key) {
    try {
      const metadataPath = path.join(this.metadataDir, `${key}.json`);
      const metadataBuffer = await fs.readFile(metadataPath);
      return JSON.parse(metadataBuffer.toString());
    } catch (error) {
      console.error('Error getting metadata:', error);
      throw error;
    }
  }

  // List files with optional prefix
  async listFiles(prefix = '') {
    try {
      const searchPath = path.join(this.filesDir, prefix);
      const files = [];

      const listFilesRecursive = async (dir, currentPrefix) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.filesDir, fullPath);

          if (entry.isDirectory()) {
            await listFilesRecursive(fullPath, relativePath);
          } else {
            try {
              const metadata = await this.getMetadata(relativePath);
              files.push(metadata);
            } catch (error) {
              console.error(`Error reading metadata for ${relativePath}:`, error);
            }
          }
        }
      };

      await listFilesRecursive(searchPath, prefix);
      return files;
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  // Delete file and metadata
  async deleteFile(key) {
    try {
      const filePath = path.join(this.filesDir, key);
      const metadataPath = path.join(this.metadataDir, `${key}.json`);

      await Promise.all([
        fs.unlink(filePath).catch(() => {}), // Ignore if file doesn't exist
        fs.unlink(metadataPath).catch(() => {}) // Ignore if metadata doesn't exist
      ]);

      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  // Get storage statistics
  async getStorageStats() {
    try {
      const files = await this.listFiles();
      
      const totalSize = files.reduce((sum, file) => sum + (file.fileSize || 0), 0);
      const fileTypes = {};
      
      files.forEach(file => {
        const ext = path.extname(file.filename).toLowerCase();
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      });

      return {
        totalFiles: files.length,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileTypes
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      throw error;
    }
  }

  // Get content type from filename
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.xml': 'application/xml',
      '.json': 'application/json'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new LocalStorageService(); 