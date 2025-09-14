const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const JobQueue = require('./services/jobQueue');
const EventBroadcaster = require('./services/eventBroadcaster');
const path = require('path');

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  // Don't exit immediately, let the server try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit immediately, let the server try to recover
});

process.on('warning', (warning) => {
  console.warn('⚠️ Process Warning:', warning.name);
  console.warn('Message:', warning.message);
  console.warn('Stack:', warning.stack);
});

// Load environment variables from multiple possible locations
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'apps', 'backend', '.env'),
  path.join(process.cwd(), '..', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`✅ Environment loaded from: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (error) {
    console.log(`⚠️ Could not load from ${envPath}: ${error.message}`);
  }
}

if (!envLoaded) {
  console.warn('⚠️ No .env file found. Using system environment variables.');
}

// Debug environment variables
console.log('🔍 Environment check:');
console.log('  - OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
console.log('  - OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log('  - NODE_ENV:', process.env.NODE_ENV);

const app = express();

// Worker process for streaming requests
let streamingWorker = null;
const activeStreams = new Map(); // Track active streaming requests
const jobQueue = new JobQueue();
const eventBroadcaster = new EventBroadcaster();

// Clean up old disconnected streams periodically
setInterval(() => {
  const now = Date.now();
  const CLEANUP_TIMEOUT = 60000; // 1 minute
  
  for (const [requestId, streamInfo] of activeStreams) {
    if (streamInfo.clientDisconnected && (now - streamInfo.startTime) > CLEANUP_TIMEOUT) {
      console.log(`🧹 [Stream] Cleaning up old disconnected stream: ${requestId}`);
      activeStreams.delete(requestId);
    }
  }
}, 30000); // Run cleanup every 30 seconds

// Start streaming worker
function startStreamingWorker() {
  console.log('🚀 Starting streaming worker process...');
  
  streamingWorker = spawn('node', ['worker.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });
  
  streamingWorker.stdout.on('data', (data) => {
    console.log(`[Worker] ${data.toString().trim()}`);
  });
  
  streamingWorker.stderr.on('data', (data) => {
    console.error(`[Worker Error] ${data.toString().trim()}`);
  });
  
  streamingWorker.on('message', (message) => {
    handleWorkerMessage(message);
  });
  
  // Set worker reference in job queue
  jobQueue.setWorker(streamingWorker);
  
  streamingWorker.on('exit', (code) => {
    console.log(`⚠️ Streaming worker exited with code ${code}`);
    streamingWorker = null;
    
    // Clean up any active streams
    for (const [requestId, streamInfo] of activeStreams) {
      if (streamInfo.res && !streamInfo.res.headersSent) {
        streamInfo.res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Worker process terminated',
          messageId: streamInfo.messageId,
          timestamp: Date.now()
        })}\\n\\n`);
        streamInfo.res.end();
      }
    }
    activeStreams.clear();
  });
  
  return streamingWorker;
}

// Handle background job messages (async mode)
function handleBackgroundJobMessage(message) {
  const { type, requestId, data } = message;
  
  // Only log non-chunk messages to keep console clean
  if (type !== 'chunk') {
    console.log(`📋 [JobQueue] Received ${type} message for background job ${requestId}`);
  }
  
  if (type === 'chunk') {
    // IMMEDIATE DELIVERY: Broadcast chunk to connected clients via SSE first
    const chatId = data.chatId || extractChatIdFromJobId(requestId);
    eventBroadcaster.broadcastToken(chatId, {
      content: data.content,
      messageId: data.messageId,
      timestamp: data.timestamp
    });
    
    // Asynchronously update database without blocking chunk delivery
    process.nextTick(() => {
      const { updateMessage } = require('./models/Chat');
      const DEMO_USER_ID = "demo-user";
      
      // Update on first chunk (token 1) and then every 10 tokens for more frequent UI updates
      if (data.tokenCount === 1 || (data.tokenCount && data.tokenCount % 10 === 0)) {
        try {
          updateMessage(chatId, data.messageId, {
            content: data.accumulatedContent || '',
            status: 'streaming'
          }, DEMO_USER_ID);
          
          // Only log first chunk and completion for clean console
          if (data.tokenCount === 1) {
            console.log(`💾 [JobQueue] Started streaming for message ${data.messageId}`);
          }
        } catch (updateError) {
          console.error(`❌ [JobQueue] Failed to update message ${data.messageId}:`, updateError);
        }
      }
    });
    
  } else if (type === 'complete') {
    // Update message with final content
    const { updateMessage } = require('./models/Chat');
    const DEMO_USER_ID = "demo-user";
    
    try {
      updateMessage(data.chatId || extractChatIdFromJobId(requestId), data.messageId, {
        content: data.finalContent,
        status: 'complete'
      }, DEMO_USER_ID);
      // Note: updateMessage will create a commit on transition to final state
      console.log(`✅ [JobQueue] Job ${requestId} completed with final content`);
    } catch (updateError) {
      console.error(`❌ [JobQueue] Failed to update message ${data.messageId}:`, updateError);
    }
    
    // Mark job as completed in queue
    jobQueue.completeJob(requestId, data);
    
    // Broadcast completion to connected clients
    const chatId = data.chatId || extractChatIdFromJobId(requestId);
    eventBroadcaster.broadcastMessageComplete(chatId, {
      messageId: data.messageId,
      finalContent: data.finalContent,
      timestamp: data.timestamp
    });
    
  } else if (type === 'cancelled') {
    // Update message with cancellation
    const { updateMessage } = require('./models/Chat');
    const DEMO_USER_ID = "demo-user";
    
    try {
      const chatId = data.chatId || extractChatIdFromJobId(requestId);
      updateMessage(chatId, data.messageId, {
        content: data.partialContent || 'Message generation was cancelled.',
        status: 'cancelled'
      }, DEMO_USER_ID);
      console.log(`🛑 [JobQueue] Job ${requestId} cancelled`);
      
      // Broadcast cancellation to connected clients
      eventBroadcaster.broadcastMessageCancelled(chatId, {
        messageId: data.messageId,
        partialContent: data.partialContent,
        timestamp: data.timestamp
      });
      
    } catch (updateError) {
      console.error(`❌ [JobQueue] Failed to update message ${data.messageId}:`, updateError);
    }
    
    // Mark job as cancelled in queue
    jobQueue.cancelJob(requestId);
    
  } else if (type === 'error') {
    // Update message with error
    const { updateMessage } = require('./models/Chat');
    const DEMO_USER_ID = "demo-user";
    
    try {
      updateMessage(data.chatId || extractChatIdFromJobId(requestId), data.messageId, {
        content: 'I apologize, but I encountered an error while generating a response. Please try again.',
        status: 'error'
      }, DEMO_USER_ID);
      console.log(`❌ [JobQueue] Job ${requestId} failed with error`);
    } catch (updateError) {
      console.error(`❌ [JobQueue] Failed to update message ${data.messageId}:`, updateError);
    }
    
    // Mark job as error in queue
    jobQueue.handleJobError(requestId, new Error(data.error || 'Unknown error'));
  }
}

// Helper function to extract chat ID from job ID
function extractChatIdFromJobId(jobId) {
  // Job ID format: chatId_messageId_timestamp
  return jobId.split('_')[0];
}

// Handle messages from worker
function handleWorkerMessage(message) {
  const { type, requestId, data } = message;
  const streamInfo = activeStreams.get(requestId);
  
  // Check if this is a background job (async mode)
  const isBackgroundJob = jobQueue.getJobStatus(requestId) !== 'not_found';
  
  if (!streamInfo && !isBackgroundJob) {
    console.warn(`⚠️ Received message for unknown request: ${requestId}. Active streams: ${activeStreams.size}`);
    console.warn(`⚠️ Message type: ${type}, available stream IDs: ${Array.from(activeStreams.keys()).join(', ')}`);
    
    // Log timing information to debug race condition
    console.warn(`⚠️ Worker message timing: type=${type}, requestId=${requestId}, currentTime=${Date.now()}`);
    return;
  }
  
  // Handle background job messages (async mode)
  if (isBackgroundJob) {
    return handleBackgroundJobMessage(message);
  }
  
  const { res, messageId, chatId, clientDisconnected } = streamInfo;
  
  // Check if client disconnected - but keep processing chunks for a bit
  if (clientDisconnected) {
    console.log(`🔌 [Stream] Client disconnected for ${requestId}, but continuing to process chunks`);
    // Don't return immediately - let chunks be processed and only cleanup on complete/error
    if (type === 'complete' || type === 'error') {
      console.log(`🧹 [Stream] Cleaning up disconnected stream ${requestId} after ${type}`);
      if (type === 'complete') {
        const { updateMessage } = require('./models/Chat');
        const DEMO_USER_ID = "demo-user";
        
        try {
          updateMessage(chatId, messageId, {
            content: data.finalContent,
            status: 'complete'
          }, DEMO_USER_ID);
          console.log(`✅ [Server] Updated message ${messageId} with final content (client disconnected)`);
        } catch (updateError) {
          console.error(`❌ [Server] Failed to update message ${messageId}:`, updateError);
        }
      }
      // Clean up ping interval if it exists
      if (streamInfo.pingInterval) {
        clearInterval(streamInfo.pingInterval);
        console.log(`🧹 [Stream] Cleaned up ping interval for disconnected ${requestId}`);
      }
      activeStreams.delete(requestId);
      return;
    }
    // For chunk messages when client disconnected, just log and continue (don't try to write to response)
    if (type === 'chunk') {
      console.log(`📦 [Stream] Received chunk for disconnected client ${requestId}: ${data.content?.substring(0, 30)}...`);
      return;
    }
  }
  
  if (!res || res.headersSent) {
    console.warn(`⚠️ Response object not available or headers already sent for request: ${requestId}`);
    activeStreams.delete(requestId);
    return;
  }
  
  try {
    if (type === 'chunk') {
      // Send chunk immediately without logging for clean console
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (writeError) {
        console.log(`🔌 [Stream] Client disconnected during chunk write for ${requestId}`);
        streamInfo.clientDisconnected = true;
        return;
      }
    } else if (type === 'complete') {
      // Update message in database
      const { updateMessage } = require('./models/Chat');
      const DEMO_USER_ID = "demo-user";
      
      try {
        updateMessage(chatId, messageId, {
          content: data.finalContent,
          status: 'complete'
        }, DEMO_USER_ID);
        console.log(`✅ [Server] Updated message ${messageId} with final content`);
      } catch (updateError) {
        console.error(`❌ [Server] Failed to update message ${messageId}:`, updateError);
      }
      
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        console.log(`📊 [Stream] Completed and sent response for ${requestId}`);
      } catch (writeError) {
        console.log(`🔌 [Stream] Client disconnected during completion write for ${requestId}:`, writeError.message);
      }
      // Clean up ping interval if it exists
      if (streamInfo.pingInterval) {
        clearInterval(streamInfo.pingInterval);
        console.log(`🧹 [Stream] Cleaned up ping interval for completed ${requestId}`);
      }
      activeStreams.delete(requestId);
      console.log(`📊 [Stream] Removed completed request ${requestId}. Remaining: ${activeStreams.size}`);
    } else if (type === 'error') {
      // Update message with error in database
      const { updateMessage } = require('./models/Chat');
      const DEMO_USER_ID = "demo-user";
      
      try {
        updateMessage(chatId, messageId, {
          content: 'I apologize, but I encountered an error while generating a response. Please try again.',
          status: 'error'
        }, DEMO_USER_ID);
        console.log(`✅ [Server] Updated message ${messageId} with error status`);
      } catch (updateError) {
        console.error(`❌ [Server] Failed to update message ${messageId} with error:`, updateError);
      }
      
      try {
        res.write(`data: ${JSON.stringify(data)}\\n\\n`);
        res.end();
        console.log(`📊 [Stream] Sent error response for ${requestId}`);
      } catch (writeError) {
        console.log(`🔌 [Stream] Client disconnected during error write for ${requestId}`);
      }
      activeStreams.delete(requestId);
      console.log(`📊 [Stream] Removed error request ${requestId}. Remaining: ${activeStreams.size}`);
    }
  } catch (error) {
    console.error(`❌ Error handling worker message for ${requestId}:`, error);
    activeStreams.delete(requestId);
  }
}

// Cleanup worker
function cleanupWorker() {
  if (streamingWorker) {
    console.log('🛑 Cleaning up streaming worker...');
    streamingWorker.kill('SIGTERM');
    
    // Force kill after 5 seconds if graceful shutdown doesn't work
    setTimeout(() => {
      if (streamingWorker) {
        console.log('⚠️ Force killing streaming worker...');
        streamingWorker.kill('SIGKILL');
      }
    }, 5000);
    
    streamingWorker = null;
  }
}

// Override console.log to suppress specific request logs
const originalConsoleLog = console.log;
console.log = function(...args) {
  const message = args.join(' ');
  // Suppress GET /api/chat/chats logs
  if (message.includes('GET /api/chat/chats') && message.includes('200 in') && message.includes('ms')) {
    return;
  }
  // Suppress GET /api/health logs
  if (message.includes('GET /api/health') && message.includes('200 in') && message.includes('ms')) {
    return;
  }
  // Call the original console.log for everything else
  originalConsoleLog.apply(console, args);
};

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Connection', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Cache-Control', 'Connection']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom logging middleware to suppress frequent chat API calls
app.use((req, res, next) => {
  // Skip logging for frequent chat API calls
  if (req.path === '/api/chat/chats' && req.method === 'GET') {
    // Add a flag to track that we're skipping this request
    req.skipLogging = true;
    return next();
  }
  
  // Skip logging for health checks
  if (req.path === '/api/health' && req.method === 'GET') {
    req.skipLogging = true;
    return next();
  }
  
  // Log other requests
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });
  
  next();
});

// Import routes
const chatRoutes = require('./routes/chat');
const agentRoutes = require('./routes/agents');
const { loadChatsFromFile } = require('./models/Chat');
const { initializeServices, cleanup } = require('./services/aiService');

// Chats will be initialized in Promise.all below

// Attach worker functions to app for routes to use
app.locals.streamingWorker = () => streamingWorker;
app.locals.activeStreams = activeStreams;
app.locals.jobQueue = jobQueue;
app.locals.eventBroadcaster = eventBroadcaster;
app.locals.handleWorkerMessage = handleWorkerMessage;

// Export function to get worker (for routes)
function getStreamingWorker() {
  return streamingWorker;
}
module.exports.getStreamingWorker = getStreamingWorker;

// Set up routes
app.use('/api/chat', chatRoutes);
app.use('/api/agents', agentRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Get AI service status
    const { checkOllamaAvailability, initializeOpenAI } = require('./services/aiService');
    
    const openaiAvailable = initializeOpenAI();
    const ollamaStatus = await checkOllamaAvailability();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        openai: openaiAvailable,
        ollama: ollamaStatus.available,
        gpu: ollamaStatus.gpu,
      },
      server: {
        port: process.env.PORT || 5300,
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5300;

// Function to find an available port
const findAvailablePort = async (startPort) => {
  const net = require('net');
  
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      server.on('error', () => {
        resolve(false);
      });
    });
  };
  
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
    if (port > startPort + 100) {
      throw new Error(`No available ports found between ${startPort} and ${startPort + 100}`);
    }
  }
  return port;
};

// Initialize AI services and chats before starting the server
Promise.all([
  initializeServices(),
  loadChatsFromFile()
]).then(async ([aiSuccess, chatsLoaded]) => {
  // Start streaming worker
  startStreamingWorker();
  if (!aiSuccess) {
    console.warn('⚠️ Some AI services may not be available. Check the logs above for details.');
  }
  
  if (chatsLoaded) {
    console.log('✅ Chats loaded successfully');
  }
  
  try {
    const availablePort = await findAvailablePort(PORT);
    const server = app.listen(availablePort, () => {
      console.log(`🚀 Server running on port ${availablePort}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (availablePort !== PORT) {
        console.log(`⚠️ Original port ${PORT} was in use, using port ${availablePort} instead`);
      }
    }); 
    
    // Increase server timeout to 10 minutes for long LLM calls
    server.setTimeout(600000); // 600,000 ms = 10 minutes
    
    // Improve keep-alive settings for better connection stability
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds (slightly higher than keep-alive)
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('🛑 SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        cleanupWorker();
        cleanup();
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        cleanupWorker();
        cleanup();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
  
}).catch(async (error) => {
  console.error('❌ Failed to initialize AI services or chats:', error);
  
  try {
    const availablePort = await findAvailablePort(PORT);
    const server = app.listen(availablePort, () => {
      console.log(`🚀 Server running on port ${availablePort}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (availablePort !== PORT) {
        console.log(`⚠️ Original port ${PORT} was in use, using port ${availablePort} instead`);
      }
    }); 
    
    // Increase server timeout to 10 minutes for long LLM calls
    server.setTimeout(600000); // 600,000 ms = 10 minutes
    
    // Improve keep-alive settings for better connection stability
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds (slightly higher than keep-alive)
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('🛑 SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        cleanupWorker();
        cleanup();
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        cleanupWorker();
        cleanup();
        process.exit(0);
      });
    });
  } catch (serverError) {
    console.error('❌ Failed to start server:', serverError);
    process.exit(1);
  }
}); 