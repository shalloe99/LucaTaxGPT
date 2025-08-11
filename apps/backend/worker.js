const { Worker } = require('worker_threads');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPaths = [
  './backend/.env',
  './.env',
  '../.env'
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`✅ [Worker] Environment loaded from: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (error) {
    console.log(`⚠️ [Worker] Could not load from ${envPath}: ${error.message}`);
  }
}

if (!envLoaded) {
  console.warn('⚠️ [Worker] No .env file found. Using system environment variables.');
}

// Initialize AI services in worker
const { initializeServices } = require('./services/aiService');

console.log('🚀 [Worker] Starting streaming worker process...');

// Initialize AI services
initializeServices().then((success) => {
  if (success) {
    console.log('✅ [Worker] AI services initialized successfully');
  } else {
    console.warn('⚠️ [Worker] Some AI services may not be available');
  }
}).catch((error) => {
  console.error('❌ [Worker] Failed to initialize AI services:', error);
});

// Worker message handling
const { generateAIResponse } = require('./services/aiService');

// Track active jobs for cancellation
const activeJobs = new Map(); // requestId -> { abortController, startTime }

// Handle streaming requests
async function handleStreamingRequest(data) {
  const { 
    requestId,
    chatId, 
    message, 
    context = '', 
    domainKnowledge = {}, 
    modelType = 'ollama', 
    model = 'phi3:3.8b',
    assistantMessageId,
    chatMessages = [], // Messages passed from main server
    isBackgroundJob = false
  } = data;
  
  const startTime = Date.now();
  
  try {
    console.log(`🚀 [Worker ${requestId}] Processing ${isBackgroundJob ? 'background' : 'streaming'} request for chat ${chatId}`);
    
    // Create abort controller for cancellation
    const abortController = new AbortController();
    
  // Track this job for potential cancellation
  activeJobs.set(requestId, {
    abortController,
    startTime,
    chatId,
    messageId: assistantMessageId,
    isBackgroundJob,
    partialContent: ''
  });
    
    // Use the messages passed from the main server (they already include the new user message)
    const messages = chatMessages;
    
    let finalContent = '';
    let tokenCount = 0;
    let accumulatedContent = '';
    
    // Generate AI response with streaming
    console.log(`🤖 [Worker ${requestId}] Starting ${modelType}/${model} generation`);
    
    const response = await generateAIResponse(messages, {
      modelType: modelType,
      model: model,
      stream: true,
      messageId: assistantMessageId,
      abortSignal: abortController.signal, // Pass abort signal
      onChunk: (chunk) => {
        // Check if job was cancelled
        if (abortController.signal.aborted) {
          console.log(`🛑 [Worker ${requestId}] Job cancelled, stopping chunk processing`);
          return;
        }
        
        if (chunk.content) {
          finalContent += chunk.content;
          accumulatedContent += chunk.content;
          tokenCount++;
          
          // Removed chunk logging for clean console output
          
          // Store partial content for potential cancellation
          const jobRef = activeJobs.get(requestId);
          if (jobRef) {
            jobRef.partialContent = accumulatedContent;
          }

          // IMMEDIATE DELIVERY: Send chunk back to main process with priority
          setImmediate(() => {
            process.send({
              type: 'chunk',
              requestId: requestId,
              data: {
                type: 'content',
                content: chunk.content,
                messageId: assistantMessageId,
                chatId: chatId,
                tokenCount: tokenCount,
                accumulatedContent: accumulatedContent,
                timestamp: Date.now()
              }
            });
          });
        }
      }
    });
    
    // Send completion back to main process (main server will handle message update)
    process.send({
      type: 'complete',
      requestId: requestId,
      data: {
        type: 'complete',
        messageId: assistantMessageId,
        chatId: chatId, // Include chatId for proper completion handling
        finalContent: finalContent,
        usage: response.usage || { prompt_tokens: 0, completion_tokens: tokenCount, total_tokens: tokenCount },
        model: response.model || model,
        provider: modelType === 'chatgpt' ? 'openai' : 'ollama',
        timestamp: Date.now(),
        processingTime: Date.now() - startTime
      }
    });
    
    console.log(`✅ [Worker ${requestId}] Completed in ${Date.now() - startTime}ms`);
    
  } catch (error) {
    console.error(`❌ [Worker ${requestId}] Error:`, error);
    
    // Send error back to main process (main server will handle message update)
    process.send({
      type: 'error',
      requestId: requestId,
      data: {
        type: 'error',
        error: 'AI service error',
        message: error.message,
        messageId: assistantMessageId,
        chatId: chatId, // Include chatId for proper error handling
        timestamp: Date.now()
      }
    });
  }
}

// Handle job cancellation
function handleJobCancellation(data) {
  const { jobId } = data;
  console.log(`🛑 [Worker] Received cancellation request for job ${jobId}`);
  
  const job = activeJobs.get(jobId);
  if (job) {
    // Abort the current AI request
    job.abortController.abort();
    console.log(`🛑 [Worker] Aborted job ${jobId}`);
    
    // Clean up from active jobs
    activeJobs.delete(jobId);
    
    // Send cancellation confirmation back to main process
    process.send({
      type: 'cancelled',
      requestId: jobId,
      data: {
        type: 'message_cancelled',
        messageId: job.messageId,
        chatId: job.chatId,
        partialContent: job.partialContent || '',
        timestamp: Date.now()
      }
    });
  } else {
    console.warn(`⚠️ [Worker] Job ${jobId} not found for cancellation`);
  }
}

// Listen for messages from main process
process.on('message', (data) => {
  if (data.type === 'streaming_request') {
    handleStreamingRequest(data);
  } else if (data.type === 'cancel_job') {
    handleJobCancellation(data);
  } else {
    console.warn(`⚠️ [Worker] Unknown message type: ${data.type}`);
  }
});

// Handle cleanup
process.on('SIGTERM', () => {
  console.log('🛑 [Worker] SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 [Worker] SIGINT received, shutting down...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ [Worker] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Worker] Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

console.log('✅ [Worker] Streaming worker is ready');
