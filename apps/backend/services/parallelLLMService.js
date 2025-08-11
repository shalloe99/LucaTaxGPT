const { generateAIResponse } = require('./aiService');
const EventEmitter = require('events');

class ParallelLLMService extends EventEmitter {
  constructor() {
    super();
    this.activeRequests = new Map();
    this.requestCounter = 0;
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Execute multiple LLM calls in parallel
   * @param {Object} params - Request parameters
   * @param {string} params.message - User message
   * @param {Array} params.models - Array of model configurations
   * @param {string} params.chatId - Chat ID for conversation context
   * @param {Object} params.context - Additional context
   * @param {Object} params.domainKnowledge - Domain knowledge
   * @param {boolean} params.stream - Whether to stream responses
   * @param {Function} params.onProgress - Progress callback
   * @returns {Promise<Object>} Results from all models
   */
  async executeParallelCalls(params) {
    const {
      message,
      models,
      chatId,
      context,
      domainKnowledge,
      stream = false,
      onProgress
    } = params;

    // Validate inputs
    if (!message || !models || !Array.isArray(models) || models.length === 0) {
      throw new Error('Message and non-empty models array are required');
    }

    // Validate each model configuration
    for (const model of models) {
      if (!model.type || !model.model) {
        throw new Error('Each model must have type and model properties');
      }
    }

    const requestId = this.generateRequestId();
    const results = {
      requestId,
      status: 'running',
      startTime: new Date().toISOString(),
      models: {},
      completed: 0,
      total: models.length,
      errors: []
    };

    // Store the request
    this.activeRequests.set(requestId, results);

    // Emit start event
    this.emit('requestStarted', { requestId, total: models.length });
    if (onProgress) {
      onProgress({ type: 'requestStarted', requestId, total: models.length });
    }

    try {
      // Create promises for all model calls
      const promises = models.map(async (modelConfig, index) => {
        const modelId = modelConfig.id || `model_${index}`;
        const modelType = modelConfig.type || 'ollama';
        const model = modelConfig.model || 'phi3:3.8b';

        // Initialize model result
        results.models[modelId] = {
          id: modelId,
          type: modelType,
          model: model,
          status: 'pending',
          startTime: new Date().toISOString(),
          response: null,
          usage: null,
          error: null
        };

        // Emit model start
        this.emit('modelStarted', { requestId, modelId, modelType, model });
        if (onProgress) {
          onProgress({ type: 'modelStarted', requestId, modelId, modelType, model });
        }

        try {
          // Prepare messages for the model
          const messages = [
            {
              role: 'user',
              content: message
            }
          ];

          // Add context if provided
          if (context) {
            messages.unshift({
              role: 'system',
              content: `Context: ${context}`
            });
          }

          // Add domain knowledge if provided
          if (domainKnowledge) {
            let domainPrompt = 'Domain Knowledge:\n';
            if (domainKnowledge.federalTaxCode) domainPrompt += '- Federal tax code access: enabled\n';
            if (domainKnowledge.stateTaxCodes?.length > 0) {
              domainPrompt += `- State tax codes: ${domainKnowledge.stateTaxCodes.join(', ')}\n`;
            }
            if (domainKnowledge.profileTags?.length > 0) {
              domainPrompt += `- User tags: ${domainKnowledge.profileTags.join(', ')}\n`;
            }
            if (domainKnowledge.filingEntity) {
              domainPrompt += `- Filing entity: ${domainKnowledge.filingEntity}\n`;
            }
            messages.unshift({
              role: 'system',
              content: domainPrompt
            });
          }

          // Execute the LLM call
          const startTime = Date.now();
          const response = await generateAIResponse(messages, {
            modelType,
            model,
            stream: false, // Always use non-streaming for parallel calls
            temperature: modelConfig.temperature || 0.7,
            maxTokens: modelConfig.maxTokens || 2000
          });

          const endTime = Date.now();
          const duration = endTime - startTime;

          // Handle different response formats
          const responseText = response.response || response || 'No response received';
          const usage = response.usage || { total_tokens: 0 };
          const provider = response.provider || modelType;

          // Update model result
          results.models[modelId] = {
            ...results.models[modelId],
            status: 'completed',
            endTime: new Date().toISOString(),
            duration,
            response: responseText,
            usage: usage,
            provider: provider
          };

          results.completed++;

          // Emit model completion
          this.emit('modelCompleted', {
            requestId,
            modelId,
            response: responseText,
            usage: usage,
            duration,
            provider: provider
          });

          if (onProgress) {
            onProgress({
              type: 'modelCompleted',
              requestId,
              modelId,
              response: responseText,
              usage: usage,
              duration,
              provider: provider,
              completed: results.completed,
              total: results.total
            });
          }

        } catch (error) {
          const endTime = Date.now();
          const duration = endTime - Date.parse(results.models[modelId].startTime);

          // Update model result with error
          results.models[modelId] = {
            ...results.models[modelId],
            status: 'error',
            endTime: new Date().toISOString(),
            duration,
            error: error.message
          };

          results.completed++;
          results.errors.push({
            modelId,
            error: error.message
          });

          // Emit model error
          this.emit('modelError', {
            requestId,
            modelId,
            error: error.message,
            duration
          });

          if (onProgress) {
            onProgress({
              type: 'modelError',
              requestId,
              modelId,
              error: error.message,
              duration,
              completed: results.completed,
              total: results.total
            });
          }
        }
      });

      // Wait for all promises to complete
      await Promise.allSettled(promises);

      // Update final status
      results.status = results.errors.length === models.length ? 'failed' : 'completed';
      results.endTime = new Date().toISOString();
      results.duration = Date.parse(results.endTime) - Date.parse(results.startTime);

      // Emit completion
      this.emit('requestCompleted', {
        requestId,
        status: results.status,
        duration: results.duration,
        completed: results.completed,
        total: results.total,
        errors: results.errors
      });

      if (onProgress) {
        onProgress({
          type: 'requestCompleted',
          requestId,
          status: results.status,
          duration: results.duration,
          completed: results.completed,
          total: results.total,
          errors: results.errors
        });
      }

    } catch (error) {
      results.status = 'failed';
      results.endTime = new Date().toISOString();
      results.error = error.message;

      this.emit('requestError', {
        requestId,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          type: 'requestError',
          requestId,
          error: error.message
        });
      }
    }

    // Clean up after a delay
    setTimeout(() => {
      this.activeRequests.delete(requestId);
    }, 60000); // Keep for 1 minute

    return results;
  }

  /**
   * Get status of a specific request
   * @param {string} requestId - Request ID
   * @returns {Object|null} Request status
   */
  getRequestStatus(requestId) {
    return this.activeRequests.get(requestId) || null;
  }

  /**
   * Get all active requests
   * @returns {Array} Array of active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Cancel a specific request
   * @param {string} requestId - Request ID
   * @returns {boolean} Success status
   */
  cancelRequest(requestId) {
    const request = this.activeRequests.get(requestId);
    if (request && request.status === 'running') {
      request.status = 'cancelled';
      request.endTime = new Date().toISOString();
      
      this.emit('requestCancelled', { requestId });
      
      setTimeout(() => {
        this.activeRequests.delete(requestId);
      }, 30000);

      return true;
    }
    return false;
  }

  /**
   * Clean up completed requests
   */
  cleanup() {
    const now = Date.now();
    for (const [requestId, request] of this.activeRequests.entries()) {
      const requestTime = Date.parse(request.startTime);
      if (now - requestTime > 300000) { // 5 minutes
        this.activeRequests.delete(requestId);
      }
    }
  }
}

// Create singleton instance
const parallelLLMService = new ParallelLLMService();

// Only start cleanup interval if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Cleanup every 5 minutes
  parallelLLMService.cleanupInterval = setInterval(() => {
    parallelLLMService.cleanup();
  }, 300000);
}

module.exports = parallelLLMService; 