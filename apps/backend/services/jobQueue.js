const EventEmitter = require('events');

/**
 * Simple in-memory job queue for background LLM processing
 * Features:
 * - FIFO job processing
 * - Job cancellation support
 * - Event-driven architecture
 * - Background processing with status tracking
 */
class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> job data
    this.activeJobs = new Map(); // jobId -> job status
    this.cancelledJobs = new Set(); // jobId set for cancelled jobs
    this.queue = []; // FIFO queue of job IDs
    this.processing = false;
    this.workerRef = null;
    
    console.log('📋 [JobQueue] Initialized');
  }

  /**
   * Set reference to the streaming worker
   */
  setWorker(worker) {
    this.workerRef = worker;
    console.log('📋 [JobQueue] Worker reference set');
  }

  /**
   * Add a new job to the queue
   */
  addJob(jobData) {
    const { jobId } = jobData;
    
    if (this.jobs.has(jobId)) {
      console.warn(`⚠️ [JobQueue] Job ${jobId} already exists`);
      return false;
    }

    this.jobs.set(jobId, {
      ...jobData,
      status: 'queued',
      queuedAt: Date.now()
    });
    
    this.queue.push(jobId);
    
    console.log(`📋 [JobQueue] Job ${jobId} added to queue. Queue size: ${this.queue.length}`);
    
    // Emit job added event
    this.emit('job_added', { jobId, jobData });
    
    // Start processing if not already processing
    this.processNext();
    
    return true;
  }

  /**
   * Cancel a job by ID
   */
  cancelJob(jobId) {
    console.log(`🛑 [JobQueue] Cancelling job ${jobId}`);
    
    this.cancelledJobs.add(jobId);
    
    // If job is queued but not processing, remove from queue
    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      console.log(`📋 [JobQueue] Removed job ${jobId} from queue`);
    }
    
    // If job is currently processing, send cancel signal to worker
    if (this.activeJobs.has(jobId)) {
      console.log(`📋 [JobQueue] Sending cancel signal to worker for job ${jobId}`);
      if (this.workerRef) {
        this.workerRef.send({
          type: 'cancel_job',
          jobId: jobId
        });
      }
    }
    
    // Update job status
    if (this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.status = 'cancelled';
      job.cancelledAt = Date.now();
    }
    
    // Emit job cancelled event
    this.emit('job_cancelled', { jobId });
    
    return true;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    if (this.cancelledJobs.has(jobId)) {
      return 'cancelled';
    }
    
    if (this.activeJobs.has(jobId)) {
      return 'processing';
    }
    
    if (this.jobs.has(jobId)) {
      return this.jobs.get(jobId).status;
    }
    
    return 'not_found';
  }

  /**
   * Get all jobs (for debugging)
   */
  getAllJobs() {
    return {
      total: this.jobs.size,
      queued: this.queue.length,
      active: this.activeJobs.size,
      cancelled: this.cancelledJobs.size
    };
  }

  /**
   * Process the next job in the queue
   */
  async processNext() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    
    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      
      // Skip if job was cancelled
      if (this.cancelledJobs.has(jobId)) {
        console.log(`📋 [JobQueue] Skipping cancelled job ${jobId}`);
        continue;
      }
      
      const job = this.jobs.get(jobId);
      if (!job) {
        console.warn(`⚠️ [JobQueue] Job ${jobId} not found in jobs map`);
        continue;
      }
      
      console.log(`📋 [JobQueue] Processing job ${jobId}`);
      
      // Mark as active
      this.activeJobs.set(jobId, {
        startedAt: Date.now(),
        status: 'processing'
      });
      
      job.status = 'processing';
      job.startedAt = Date.now();
      
      // Emit job started event
      this.emit('job_started', { jobId, job });
      
      try {
        await this.executeJob(job);
      } catch (error) {
        console.error(`❌ [JobQueue] Job ${jobId} failed:`, error);
        this.handleJobError(jobId, error);
      }
    }
    
    this.processing = false;
  }

  /**
   * Execute a job by sending it to the worker
   */
  async executeJob(job) {
    const { jobId } = job;
    
    if (!this.workerRef) {
      throw new Error('Worker not available');
    }
    
    console.log(`🚀 [JobQueue] Executing job ${jobId} via worker`);
    
    // Send job to worker
    this.workerRef.send({
      type: 'streaming_request',
      requestId: jobId,
      chatId: job.chatId,
      message: job.userMessage,
      context: job.context,
      domainKnowledge: job.domainKnowledge,
      modelType: job.modelType,
      model: job.model,
      assistantMessageId: job.messageId,
      chatMessages: job.chatMessages,
      isBackgroundJob: true
    });
    
    // The job will be completed when we receive completion message from worker
    // This is handled in the server's handleWorkerMessage function
  }

  /**
   * Mark job as completed (called from worker message handler)
   */
  completeJob(jobId, result = {}) {
    console.log(`✅ [JobQueue] Job ${jobId} completed`);
    
    // Remove from active jobs
    this.activeJobs.delete(jobId);
    
    // Update job status
    if (this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;
    }
    
    // Emit job completed event
    this.emit('job_completed', { jobId, result });
    
    // Continue processing queue
    this.processNext();
  }

  /**
   * Handle job error
   */
  handleJobError(jobId, error) {
    console.error(`❌ [JobQueue] Job ${jobId} error:`, error);
    
    // Remove from active jobs
    this.activeJobs.delete(jobId);
    
    // Update job status
    if (this.jobs.has(jobId)) {
      const job = this.jobs.get(jobId);
      job.status = 'error';
      job.errorAt = Date.now();
      job.error = error.message;
    }
    
    // Emit job error event
    this.emit('job_error', { jobId, error });
    
    // Continue processing queue
    this.processNext();
  }

  /**
   * Clean up old completed/cancelled jobs (run periodically)
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // Default: 24 hours
    const now = Date.now();
    let cleaned = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      const jobAge = now - job.queuedAt;
      
      if (jobAge > maxAge && ['completed', 'error', 'cancelled'].includes(job.status)) {
        this.jobs.delete(jobId);
        this.cancelledJobs.delete(jobId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [JobQueue] Cleaned up ${cleaned} old jobs`);
    }
  }
}

module.exports = JobQueue;
