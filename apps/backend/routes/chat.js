const express = require('express');
const router = express.Router();
const { chats, createChat, saveChatsToFile, addMessage, updateMessage, findChatById, softRebaseEditMessage, rebuildMessagesFromCommits, beginReloadAssistantMessage } = require('../models/Chat');
const { generateAIResponse, getAvailableModels, getDefaultModel } = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');

// For now, hardcode userId
const DEMO_USER_ID = "demo-user";

/**
 * Optimized filter to include only the latest response in each turn
 * This function is used for LLM context - it should include the FULL conversation
 * with only the latest bot response per turn (not exclude turns being retried)
 * @param {Array} messages - Array of chat messages
 * @param {string|null} rerunOfUserId - ID of user message being retried (for logging only)
 * @returns {Array} Filtered messages with only latest responses per turn
 */
function filterChatHistoryForLLM(messages, rerunOfUserId = null) {
  if (!messages || messages.length === 0) return [];
  
  // Single pass optimization: group by user message and find latest assistant for each
  const turnGroups = new Map(); // userMessageId -> { user: message, latestAssistant: message }
  
  for (const message of messages) {
    if (message.role === 'user') {
      // Initialize turn group for this user message
      if (!turnGroups.has(message.id)) {
        turnGroups.set(message.id, { user: message, latestAssistant: null });
      }
    } else if (message.role === 'assistant' && message.parentUserId) {
      // Update latest assistant for this user message
      const turn = turnGroups.get(message.parentUserId);
      if (turn) {
        if (!turn.latestAssistant || message.timestamp > turn.latestAssistant.timestamp) {
          turn.latestAssistant = message;
        }
      }
    }
  }
  
  // Build final result - ALWAYS include ALL turns for LLM context
  // Only filter out duplicate/older bot responses within each turn
  const result = [];
  for (const [userId, turn] of turnGroups) {
    // Add user message (always include)
    result.push(turn.user);
    
    // Add latest assistant response if exists (filter out duplicates)
    if (turn.latestAssistant) {
      result.push(turn.latestAssistant);
    }
  }
  
  // Log rerun information for debugging (but don't exclude turns)
  if (rerunOfUserId) {
    console.log(`🔄 [Filter] Rerun mode: including full conversation context for retry of user=${rerunOfUserId}`);
  }
  
  console.log(`🔍 [Filter] Optimized: ${messages.length} → ${result.length} messages`);
  console.log(`🔍 [Filter] Rerun mode: ${rerunOfUserId ? 'enabled' : 'disabled'}`);
  
  return result;
}

// In-memory feedback store for demo
const feedbackStore = [];

// Collect feedback on bot responses
router.post('/feedback', (req, res) => {
  const { chatId, messageId, feedback, comment, context } = req.body;
  feedbackStore.push({
    chatId,
    messageId,
    feedback,
    comment,
    context,
    timestamp: new Date().toISOString(),
  });
  console.log('Feedback received:', { chatId, messageId, feedback, comment });
  res.json({ success: true });
});

// List all conversations for user
router.get('/chats', (req, res) => {
  const userConvs = chats.filter(c => c.userId === DEMO_USER_ID);
  res.json(userConvs);
});

// Get one conversation
router.get('/chats/:id', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv);
});

// Create new conversation
router.post('/chats', (req, res) => {
  const conv = createChat({
    userId: DEMO_USER_ID,
    ...req.body
  });
  chats.unshift(conv);
  
  // Save to disk
  saveChatsToFile().catch(error => {
    console.error('❌ Error saving chats after creation:', error);
  });
  
  res.status(201).json(conv);
});

// Update/override conversation (title, contextFilters, etc)
router.put('/chats/:id', (req, res) => {
  const idx = chats.findIndex(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  chats[idx] = { ...chats[idx], ...req.body, updatedAt: new Date().toISOString() };
  
  // Save to disk
  saveChatsToFile().catch(error => {
    console.error('❌ Error saving chats after update:', error);
  });
  
  res.json(chats[idx]);
});

// Delete conversation
router.delete('/chats/:id', (req, res) => {
  const idx = chats.findIndex(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  chats.splice(idx, 1);
  
  // Save to disk
  saveChatsToFile().catch(error => {
    console.error('❌ Error saving chats after deletion:', error);
  });
  
  res.json({ success: true });
});

// Get commit history for a chat
router.get('/chats/:id/commits', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json({
    headCommitId: conv.headCommitId || null,
    commits: conv.commits || []
  });
});

// Soft-rebase edit of a past message (replace the edited commit, drop subsequent commits, then re-commit)
router.patch('/chats/:id/messages/:messageId', (req, res) => {
  const { id: chatId, messageId } = { id: req.params.id, messageId: req.params.messageId };
  const { content, role, status } = req.body || {};
  const conv = chats.find(c => c.id === chatId && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Chat not found' });
  
  if (typeof content === 'undefined' && typeof role === 'undefined' && typeof status === 'undefined') {
    return res.status(400).json({ error: 'No updates provided. Provide at least one of: content, role, status.' });
  }
  
  try {
    const updates = {};
    if (typeof content !== 'undefined') updates.content = content;
    if (typeof role !== 'undefined') updates.role = role;
    if (typeof status !== 'undefined') updates.status = status;
    const commit = softRebaseEditMessage(chatId, messageId, updates, DEMO_USER_ID);
    
    // Optionally rebuild messages from commits to ensure consistency
    rebuildMessagesFromCommits(conv);
    
    // Persist
    saveChatsToFile().catch(() => {});
    
    return res.json({
      success: true,
      headCommitId: conv.headCommitId || null,
      commit
    });
  } catch (error) {
    console.error('❌ Soft rebase edit error:', error);
    return res.status(400).json({ error: error.message });
  }
});

// Add message to conversation (and optionally update contextFilters)
router.post('/chats/:id/messages', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  
  const { role, content } = req.body;
  if (!role || !content) return res.status(400).json({ error: 'Role and content are required' });
  
  const message = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  
  conv.messages.push(message);
  conv.updatedAt = new Date().toISOString();
  
  // Save to disk
  saveChatsToFile().catch(error => {
    console.error('❌ Error saving chats after message:', error);
  });
  
  res.json(message);
});

// Simple test endpoint to check chats array
router.get('/debug/chats', (req, res) => {
  const testChatId = chats[0]?.id;
  const testResult = testChatId ? findChatById(testChatId, DEMO_USER_ID) : null;
  
  res.json({
    totalChats: chats.length,
    chats: chats.map(c => ({ id: c.id, userId: c.userId, title: c.title })),
    demoUserChats: chats.filter(c => c.userId === DEMO_USER_ID).length,
    DEMO_USER_ID: DEMO_USER_ID,
    testChatId: testChatId,
    testResult: testResult ? testResult.id : null,
    findChatByIdType: typeof findChatById
  });
});

// Debug endpoint to test findChatById
router.get('/debug/chat/:chatId', (req, res) => {
  const { chatId } = req.params;
  console.log(`🔍 [DEBUG] Looking for chat: ${chatId}`);
  console.log(`🔍 [DEBUG] Available chats:`, chats.map(c => ({ id: c.id, userId: c.userId })));
  
  // Test if findChatById is working
  console.log(`🔍 [DEBUG] findChatById function:`, typeof findChatById);
  console.log(`🔍 [DEBUG] DEMO_USER_ID:`, DEMO_USER_ID);
  
  const chat = findChatById(chatId, DEMO_USER_ID);
  console.log(`🔍 [DEBUG] Found chat:`, chat ? chat.id : 'null');
  
  // Also test direct find
  const directChat = chats.find(c => c.id === chatId && c.userId === DEMO_USER_ID);
  console.log(`🔍 [DEBUG] Direct find result:`, directChat ? directChat.id : 'null');
  
  // Test manual find
  const manualChat = chats.find(c => c.id === chatId);
  console.log(`🔍 [DEBUG] Manual find (no userId filter):`, manualChat ? manualChat.id : 'null');
  
  res.json({
    chatId,
    found: !!chat,
    chat: chat ? { id: chat.id, userId: chat.userId, title: chat.title } : null,
    directFound: !!directChat,
    directChat: directChat ? { id: directChat.id, userId: directChat.userId, title: directChat.title } : null,
    manualFound: !!manualChat,
    manualChat: manualChat ? { id: manualChat.id, userId: manualChat.userId, title: manualChat.title } : null,
    totalChats: chats.length,
    demoUserChats: chats.filter(c => c.userId === DEMO_USER_ID).length,
    allChats: chats.map(c => ({ id: c.id, userId: c.userId }))
  });
});

// Get available AI models
router.get('/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    res.json(models);
  } catch (error) {
    console.error('❌ Error getting models:', error);
    res.status(500).json({ error: 'Failed to get models' });
  }
});

// Health check for chat system
router.get('/health', (req, res) => {
  try {
    const totalChats = chats.length;
    const totalMessages = chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
    const totalCommits = chats.reduce((sum, chat) => sum + (chat.commits?.length || 0), 0);
    
    res.json({
      status: 'healthy',
      stats: {
        totalChats,
        totalMessages,
        totalCommits,
        demoUserId: DEMO_USER_ID
      },
      sampleChats: chats.slice(0, 2).map(chat => ({
        id: chat.id,
        title: chat.title,
        messageCount: chat.messages?.length || 0,
        commitCount: chat.commits?.length || 0,
        hasCommitStructure: !!(chat.commits && typeof chat.headCommitId !== 'undefined')
      }))
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ error: 'Health check failed', details: error.message });
  }
});

// New async messaging endpoint for background processing
router.post('/user/messaging/:chatId/', async (req, res) => {
  const { mode = 'sync', modelType = 'ollama', model = 'phi3:3.8b' } = req.body;
  
  console.log(`🔧🔧🔧 [${req.params.chatId}] ROUTE DEBUG - Request mode: "${mode}", modelType: "${modelType}", model: "${model}"`);
  console.log(`🔧🔧🔧 [${req.params.chatId}] ROUTE DEBUG - Full body:`, JSON.stringify(req.body, null, 2));
  console.log(`🔧🔧🔧 [${req.params.chatId}] ROUTE DEBUG - mode === 'async': ${mode === 'async'}`);
  console.log(`🔧🔧🔧 [${req.params.chatId}] ROUTE DEBUG - typeof mode: ${typeof mode}`);
  
  if (mode === 'async') {
    console.log(`🔧🔧🔧 [${req.params.chatId}] TAKING ASYNC PATH`);
    return handleAsyncMessage(req, res);
  } else {
    console.log(`🔧🔧🔧 [${req.params.chatId}] TAKING SYNC PATH`);
    return handleSyncMessage(req, res);
  }
});

// Async message handler - returns immediate acknowledgment
async function handleAsyncMessage(req, res) {
  const startTime = Date.now();
  let userMessage = null;
  let assistantMessage = null;
  let chatId = null;
  
  try {
    chatId = req.params.chatId;
    const { 
      message, 
      context = '', 
      domainKnowledge = {}, 
      modelType = 'ollama', 
      model = 'phi3:3.8b',
      rerunOfUserId = null
    } = req.body;
    
    console.log(`🚀 [${chatId}] Async message request: ${message?.substring(0, 100)}...`);
    console.log(`📋 [${chatId}] Model: ${modelType}/${model}, Mode: async`);
    
    // Validate chat exists
    const chat = findChatById(chatId, DEMO_USER_ID);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Step 1: Save user message immediately with status 'complete' unless this is a rerun
    if (!rerunOfUserId) {
      try {
        userMessage = addMessage(chatId, {
          role: 'user',
          content: message,
          status: 'complete'
        }, DEMO_USER_ID);
        console.log(`✅ [${chatId}] User message saved: ${userMessage.id}`);
      } catch (error) {
        console.error(`❌ [${chatId}] Failed to save user message:`, error);
        return res.status(500).json({ error: 'Failed to save user message' });
      }
    } else {
      // Use provided rerun user id and verify it exists
      console.log(`🔍 [${chatId}] Validating rerunOfUserId: ${rerunOfUserId}`);
      console.log(`🔍 [${chatId}] Available messages:`, chat.messages.map(m => ({ id: m.id, role: m.role, content: m.content?.substring(0, 50) })));
      
      const sourceUserMsg = chat.messages.find(m => m.id === rerunOfUserId && m.role === 'user');
      if (!sourceUserMsg) {
        console.error(`❌ [${chatId}] Invalid rerunOfUserId: ${rerunOfUserId}. Message not found or not a user message.`);
        return res.status(400).json({ 
          error: 'Invalid rerunOfUserId', 
          details: `Message with ID ${rerunOfUserId} not found or not a user message`,
          availableUserMessages: chat.messages.filter(m => m.role === 'user').map(m => ({ id: m.id, content: m.content?.substring(0, 50) }))
        });
      }
      userMessage = sourceUserMsg;
      console.log(`✅ [${chatId}] Found rerun user message: ${userMessage.id} - "${userMessage.content?.substring(0, 50)}..."`);
    }
    
    // Step 2: Create assistant placeholder with status 'pending'
    try {
      assistantMessage = addMessage(chatId, {
        role: 'assistant',
        content: '',
        status: 'pending',
        parentUserId: userMessage.id
      }, DEMO_USER_ID);
      console.log(`✅ [${chatId}] Assistant placeholder created: ${assistantMessage.id}`);
    } catch (error) {
      console.error(`❌ [${chatId}] Failed to create assistant placeholder:`, error);
      return res.status(500).json({ error: 'Failed to create assistant message' });
    }
    
    // Step 3: Queue background LLM job
    const jobId = `${chatId}_${assistantMessage.id}_${Date.now()}`;
    
    // Filter chat history to only include the latest response in each turn
    // and exclude the turn being retried if this is a rerun
    const filteredHistory = filterChatHistoryForLLM(chat.messages, rerunOfUserId);
    

    
    const jobData = {
      jobId,
      chatId,
      messageId: assistantMessage.id,
      userMessage: message,
      context,
      domainKnowledge,
      modelType,
      model,
      parentUserId: userMessage.id,
      chatMessages: filteredHistory.concat(rerunOfUserId ? [] : [userMessage]) // Include new user message only if not rerun
    };
    
    // Add job to queue (we'll implement the queue system next)
    if (req.app.locals.jobQueue) {
      req.app.locals.jobQueue.addJob(jobData);
      console.log(`📋 [${chatId}] Job ${jobId} queued for background processing`);
    } else {
      console.warn(`⚠️ [${chatId}] Job queue not available, falling back to direct processing`);
      // Fallback to direct processing if queue not available
      processLLMJobDirectly(jobData);
    }
    
    // Step 4: Return immediate acknowledgment
    return res.json({
      success: true,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      jobId,
      status: 'queued',
      processingTime: Date.now() - startTime
    });
    
  } catch (error) {
    console.error(`❌ [${chatId}] Async message error:`, error);
    
    // Clean up on error
    if (assistantMessage) {
      try {
        updateMessage(chatId, assistantMessage.id, {
          content: 'Error processing request',
          status: 'error'
        }, DEMO_USER_ID);
      } catch (cleanupError) {
        console.error(`❌ [${chatId}] Failed to update message on error:`, cleanupError);
      }
    }
    
    return res.status(500).json({
      error: 'Failed to process async message',
      details: error.message
    });
  }
}

// Fallback direct processing if job queue not available
async function processLLMJobDirectly(jobData) {
  console.log(`🔄 [${jobData.chatId}] Processing job ${jobData.jobId} directly`);
  
  try {
    // Update status to streaming
    updateMessage(jobData.chatId, jobData.messageId, {
      status: 'streaming'
    }, DEMO_USER_ID);
    
    // Process via worker (simplified version)
    const worker = require('../server').getStreamingWorker();
    if (worker) {
      worker.send({
        type: 'streaming_request',
        requestId: jobData.jobId,
        chatId: jobData.chatId,
        message: jobData.userMessage,
        context: jobData.context,
        domainKnowledge: jobData.domainKnowledge,
        modelType: jobData.modelType,
        model: jobData.model,
        assistantMessageId: jobData.messageId,
        chatMessages: jobData.chatMessages,
        isBackgroundJob: true
      });
    } else {
      throw new Error('Worker not available');
    }
  } catch (error) {
    console.error(`❌ [${jobData.chatId}] Direct processing failed:`, error);
    updateMessage(jobData.chatId, jobData.messageId, {
      content: 'Error processing request',
      status: 'error'
    }, DEMO_USER_ID);
  }
}

// Sync message handler - original streaming behavior
async function handleSyncMessage(req, res) {
  const startTime = Date.now();
  let userMessage = null;
  let assistantMessage = null;
  let chatId = null;
  
  try {
    chatId = req.params.chatId;
    const { 
      message, 
      context = '', 
      domainKnowledge = {}, 
      modelType = 'ollama', 
      model = 'phi3:3.8b',
      stream = true,
      rerunOfUserId = null
    } = req.body;
    
    console.log(`🚀 [${chatId}] Streaming message request: ${message?.substring(0, 100)}...`);
    console.log(`📋 [${chatId}] Model: ${modelType}/${model}, Stream: ${stream}`);
    
    // Validate chat exists
    const chat = findChatById(chatId, DEMO_USER_ID);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Step 1: Save user message immediately unless rerun
    if (!rerunOfUserId) {
      try {
        userMessage = addMessage(chatId, {
          role: 'user',
          content: message,
          status: 'complete'
        }, DEMO_USER_ID);
        console.log(`✅ [${chatId}] User message saved: ${userMessage.id}`);
      } catch (error) {
        console.error(`❌ [${chatId}] Failed to save user message:`, error);
        return res.status(500).json({ error: 'Failed to save user message' });
      }
    } else {
      console.log(`🔍 [${chatId}] Validating rerunOfUserId: ${rerunOfUserId}`);
      console.log(`🔍 [${chatId}] Available messages:`, chat.messages.map(m => ({ id: m.id, role: m.role, content: m.content?.substring(0, 50) })));
      
      const sourceUserMsg = chat.messages.find(m => m.id === rerunOfUserId && m.role === 'user');
      if (!sourceUserMsg) {
        console.error(`❌ [${chatId}] Invalid rerunOfUserId: ${rerunOfUserId}. Message not found or not a user message.`);
        return res.status(400).json({ 
          error: 'Invalid rerunOfUserId', 
          details: `Message with ID ${rerunOfUserId} not found or not a user message`,
          availableUserMessages: chat.messages.filter(m => m.role === 'user').map(m => ({ id: m.id, content: m.content?.substring(0, 50) }))
        });
      }
      userMessage = sourceUserMsg;
      console.log(`✅ [${chatId}] Found rerun user message: ${userMessage.id} - "${userMessage.content?.substring(0, 50)}..."`);
    }
    
    // Step 2: Create assistant placeholder with streaming status
    try {
      assistantMessage = addMessage(chatId, {
        role: 'assistant',
        content: '',
        status: 'streaming',
        parentUserId: userMessage.id
      }, DEMO_USER_ID);
      console.log(`✅ [${chatId}] Assistant placeholder created: ${assistantMessage.id}`);
    } catch (error) {
      console.error(`❌ [${chatId}] Failed to create assistant placeholder:`, error);
      return res.status(500).json({ error: 'Failed to create assistant message' });
    }
    
    // Step 3: Generate AI response based on model type
    try {
      // Build message context for AI
      // Filter to only include the latest response in each turn and exclude the turn being retried
      const filteredMessages = filterChatHistoryForLLM(chat.messages, rerunOfUserId);
      

      
      const messages = filteredMessages
        .filter(m => m.status === 'complete')
        .map(m => ({ role: m.role, content: m.content }));
      
      // Add the new user message
      messages.push({ role: 'user', content: message });
      
      let finalContent = '';
      let tokenCount = 0;
      
      if (modelType === 'chatgpt') {
        // Cloud-based ChatGPT response
        console.log(`☁️ [${chatId}] Using ChatGPT model: ${model}`);
        
        if (!stream) {
          // Non-streaming ChatGPT response
          const response = await generateAIResponse(messages, {
            modelType: 'chatgpt',
            model: model,
            stream: false,
            messageId: assistantMessage.id
          });
          
          finalContent = response.response || response.content || 'No response generated';
          
          updateMessage(chatId, assistantMessage.id, {
            content: finalContent,
            status: 'complete'
          }, DEMO_USER_ID);
          
          return res.json({
            response: finalContent,
            usage: response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            model: response.model || model,
            provider: 'openai',
            messageId: assistantMessage.id,
            processingTime: Date.now() - startTime
          });
        } else {
          // Delegate streaming to worker process
          const worker = req.app.locals.streamingWorker();
          if (!worker) {
            throw new Error('Streaming worker not available');
          }
          
          // Set up streaming headers
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
          
          // Generate unique request ID
          const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Track this stream
          req.app.locals.activeStreams.set(requestId, {
            res: res,
            messageId: assistantMessage.id,
            chatId: chatId,
            startTime: startTime
          });
          
          // Send immediate ping to establish connection
          res.write(': connected\n\n');
          
          console.log(`📊 [Stream] Added request ${requestId} to active streams. Total: ${req.app.locals.activeStreams.size}`);
          console.log(`🔗 [Stream] Connection ping sent for ${requestId}`);
          
          // Set up periodic ping to keep connection alive
          const pingInterval = setInterval(() => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (stream && !stream.clientDisconnected) {
              try {
                res.write(': ping\n\n');
                console.log(`🏓 [Stream] Sent ping for ${requestId}`);
              } catch (pingError) {
                console.log(`🔌 [Stream] Client disconnected during ping for ${requestId}`);
                stream.clientDisconnected = true;
                clearInterval(pingInterval);
              }
            } else {
              clearInterval(pingInterval);
            }
          }, 30000); // Ping every 30 seconds
          
          // Monitor connection health
          const connectionCheckInterval = setInterval(() => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (!stream) {
              clearInterval(connectionCheckInterval);
              return;
            }
            
            if (stream.clientDisconnected) {
              console.log(`🔍 [Stream] Connection check: ${requestId} is disconnected`);
              clearInterval(connectionCheckInterval);
              return;
            }
            
            // Check if connection is still valid
            if (res.writableEnded || res.destroyed) {
              console.log(`🔍 [Stream] Connection check: ${requestId} response ended/destroyed`);
              stream.clientDisconnected = true;
              clearInterval(connectionCheckInterval);
            } else {
              console.log(`✅ [Stream] Connection check: ${requestId} still healthy`);
            }
          }, 15000); // Check every 15 seconds
          
          // Store intervals for cleanup
          const streamInfo = req.app.locals.activeStreams.get(requestId);
          streamInfo.pingInterval = pingInterval;
          streamInfo.connectionCheckInterval = connectionCheckInterval;
          
          // Send request to worker (include chat messages for context)
          worker.send({
            type: 'streaming_request',
            requestId: requestId,
            chatId: chatId,
            message: message,
            context: context,
            domainKnowledge: domainKnowledge,
            modelType: modelType,
            model: model,
            assistantMessageId: assistantMessage.id,
            chatMessages: messages // Pass the context messages to worker
          });
          
          // Handle client disconnect - mark as disconnected but don't delete immediately
          req.on('close', () => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (stream) {
              stream.clientDisconnected = true;
              const duration = Date.now() - stream.startTime;
              console.log(`🔌 [Stream] Client disconnected for request ${requestId} after ${duration}ms, but keeping for worker completion`);
              console.log(`📊 [Stream] Disconnect details - User-Agent: ${req.get('User-Agent')}, IP: ${req.ip}, Headers: ${JSON.stringify(req.headers)}`);
              
              // Clean up ping interval
              if (stream.pingInterval) {
                clearInterval(stream.pingInterval);
                console.log(`🧹 [Stream] Cleaned up ping interval for ${requestId}`);
              }
              
              // Clean up connection check interval
              if (stream.connectionCheckInterval) {
                clearInterval(stream.connectionCheckInterval);
                console.log(`🧹 [Stream] Cleaned up connection check interval for ${requestId}`);
              }
            }
          });
          
          // Add connection monitoring
          req.on('error', (error) => {
            console.error(`❌ [Stream] Connection error for ${requestId}:`, error.message);
            console.log(`📊 [Stream] Error details - Code: ${error.code}, Type: ${error.name}`);
          });
          
          // Add additional debugging
          console.log(`🌐 [Stream] Stream headers sent for ${requestId}, waiting for worker chunks...`);
        }
        
      } else if (modelType === 'ollama') {
        // Local Ollama response
        console.log(`🏠 [${chatId}] Using local Ollama model: ${model}`);
        
        if (!stream) {
          // Non-streaming Ollama response
          const response = await generateAIResponse(messages, {
            modelType: 'ollama',
            model: model,
            stream: false,
            messageId: assistantMessage.id
          });
          
          finalContent = response.response || response.content || 'No response generated';
          
          updateMessage(chatId, assistantMessage.id, {
            content: finalContent,
            status: 'complete'
          }, DEMO_USER_ID);
          
          return res.json({
            response: finalContent,
            usage: response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            model: response.model || model,
            provider: 'ollama',
            messageId: assistantMessage.id,
            processingTime: Date.now() - startTime
          });
        } else {
          // Delegate streaming to worker process
          const worker = req.app.locals.streamingWorker();
          if (!worker) {
            throw new Error('Streaming worker not available');
          }
          
          // Set up streaming headers
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
          
          // Generate unique request ID
          const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Track this stream
          req.app.locals.activeStreams.set(requestId, {
            res: res,
            messageId: assistantMessage.id,
            chatId: chatId,
            startTime: startTime
          });
          
          // Send immediate ping to establish connection
          res.write(': connected\n\n');
          
          console.log(`📊 [Stream] Added request ${requestId} to active streams. Total: ${req.app.locals.activeStreams.size}`);
          console.log(`🔗 [Stream] Connection ping sent for ${requestId}`);
          
          // Set up periodic ping to keep connection alive
          const pingInterval = setInterval(() => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (stream && !stream.clientDisconnected) {
              try {
                res.write(': ping\n\n');
                console.log(`🏓 [Stream] Sent ping for ${requestId}`);
              } catch (pingError) {
                console.log(`🔌 [Stream] Client disconnected during ping for ${requestId}`);
                stream.clientDisconnected = true;
                clearInterval(pingInterval);
              }
            } else {
              clearInterval(pingInterval);
            }
          }, 30000); // Ping every 30 seconds
          
          // Monitor connection health
          const connectionCheckInterval = setInterval(() => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (!stream) {
              clearInterval(connectionCheckInterval);
              return;
            }
            
            if (stream.clientDisconnected) {
              console.log(`🔍 [Stream] Connection check: ${requestId} is disconnected`);
              clearInterval(connectionCheckInterval);
              return;
            }
            
            // Check if connection is still valid
            if (res.writableEnded || res.destroyed) {
              console.log(`🔍 [Stream] Connection check: ${requestId} response ended/destroyed`);
              stream.clientDisconnected = true;
              clearInterval(connectionCheckInterval);
            } else {
              console.log(`✅ [Stream] Connection check: ${requestId} still healthy`);
            }
          }, 15000); // Check every 15 seconds
          
          // Store intervals for cleanup
          const streamInfoOllama = req.app.locals.activeStreams.get(requestId);
          streamInfoOllama.pingInterval = pingInterval;
          streamInfoOllama.connectionCheckInterval = connectionCheckInterval;
          
          // Send request to worker (include chat messages for context)
          worker.send({
            type: 'streaming_request',
            requestId: requestId,
            chatId: chatId,
            message: message,
            context: context,
            domainKnowledge: domainKnowledge,
            modelType: 'ollama',
            model: model,
            assistantMessageId: assistantMessage.id,
            chatMessages: messages // Pass the context messages to worker
          });
          
          // Handle client disconnect - mark as disconnected but don't delete immediately
          req.on('close', () => {
            const stream = req.app.locals.activeStreams.get(requestId);
            if (stream) {
              stream.clientDisconnected = true;
              const duration = Date.now() - stream.startTime;
              console.log(`🔌 [Stream] Client disconnected for request ${requestId} after ${duration}ms, but keeping for worker completion`);
              console.log(`📊 [Stream] Disconnect details - User-Agent: ${req.get('User-Agent')}, IP: ${req.ip}`);
              
              // Clean up ping interval
              if (stream.pingInterval) {
                clearInterval(stream.pingInterval);
                console.log(`🧹 [Stream] Cleaned up ping interval for ${requestId}`);
              }
              
              // Clean up connection check interval
              if (stream.connectionCheckInterval) {
                clearInterval(stream.connectionCheckInterval);
                console.log(`🧹 [Stream] Cleaned up connection check interval for ${requestId}`);
              }
            }
          });
          
          // Add connection monitoring
          req.on('error', (error) => {
            console.error(`❌ [Stream] Connection error for ${requestId}:`, error.message);
            console.log(`📊 [Stream] Error details - Code: ${error.code}, Type: ${error.name}`);
          });
        }
        
      } else {
        throw new Error(`Unsupported model type: ${modelType}`);
      }
      
    } catch (aiError) {
      console.error(`❌ [${chatId}] AI generation error:`, aiError);
      
      const errorContent = `I apologize, but I encountered an error while generating a response. Please try again.`;
      
      updateMessage(chatId, assistantMessage.id, {
        content: errorContent,
        status: 'error'
      }, DEMO_USER_ID);
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'AI service error',
          message: aiError.message,
          messageId: assistantMessage.id
        });
      } else {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'AI service error',
          message: aiError.message,
          messageId: assistantMessage.id,
          timestamp: Date.now()
        })}\\n\\n`);
        res.end();
      }
    }
    
  } catch (error) {
    console.error(`❌ [${chatId || 'unknown'}] Endpoint error:`, error);
    
    // Clean up failed assistant message if it exists
    if (assistantMessage && chatId) {
      try {
        updateMessage(chatId, assistantMessage.id, {
          content: 'Failed to generate response due to server error.',
          status: 'error'
        }, DEMO_USER_ID);
      } catch (cleanupError) {
        console.error(`❌ [${chatId}] Failed to cleanup assistant message:`, cleanupError);
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process message',
        details: error.message 
      });
    }
  }
}



// SSE subscription endpoint for real-time chat updates
router.get('/user/messaging/:chatId/subscribe', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    console.log(`📡 [${chatId}] SSE subscription request`);
    
    // Validate chat exists
    const chat = findChatById(chatId, DEMO_USER_ID);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Get event broadcaster from app locals
    const eventBroadcaster = req.app.locals.eventBroadcaster;
    if (!eventBroadcaster) {
      return res.status(500).json({ error: 'Event broadcaster not available' });
    }
    
    // Subscribe client to chat events
    const connectionId = eventBroadcaster.subscribe(chatId, res);
    
    console.log(`📡 [${chatId}] Client ${connectionId} subscribed to SSE updates`);
    
    // Keep the connection alive with periodic pings
    const pingInterval = setInterval(() => {
      try {
        eventBroadcaster.sendSSEEvent(res, 'ping', { 
          timestamp: Date.now(),
          connectionId 
        });
      } catch (error) {
        console.log(`📡 [${chatId}] SSE connection closed for ${connectionId}`);
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
    
    // Clean up on disconnect
    res.on('close', () => {
      clearInterval(pingInterval);
      console.log(`📡 [${chatId}] SSE connection closed for ${connectionId}`);
    });
    
  } catch (error) {
    console.error('❌ SSE subscription error:', error);
    return res.status(500).json({
      error: 'Failed to subscribe to chat events',
      details: error.message
    });
  }
});

// Cancellation API endpoint
router.patch('/user/messaging/:chatId/message/:messageId/status', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { action } = req.body;
    
    console.log(`🛑 [${chatId}] Cancellation request for message ${messageId}, action: ${action}`);
    
    if (action !== 'cancel') {
      return res.status(400).json({ error: 'Invalid action. Only "cancel" is supported.' });
    }
    
    // Validate chat exists
    const chat = findChatById(chatId, DEMO_USER_ID);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Find the message
    const message = chat.messages.find(m => m.id === messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if message is in a cancellable state
    if (!['pending', 'streaming'].includes(message.status)) {
      return res.status(400).json({ 
        error: 'Message cannot be cancelled', 
        currentStatus: message.status 
      });
    }
    
    // Find the background job for this message
    const jobQueue = req.app.locals.jobQueue;
    if (!jobQueue) {
      return res.status(500).json({ error: 'Job queue not available' });
    }
    
    // Try to find job by scanning for chatId_messageId pattern
    let jobId = null;
    const allJobs = jobQueue.getAllJobs();
    
    // Look for active job matching this message
    for (const [jId, job] of jobQueue.jobs.entries()) {
      if (job.chatId === chatId && job.messageId === messageId) {
        jobId = jId;
        break;
      }
    }
    
    if (!jobId) {
      // Maybe job already completed or not found, update message status directly
      console.log(`⚠️ [${chatId}] No active job found for message ${messageId}, updating status directly`);
      
      try {
        updateMessage(chatId, messageId, {
          status: 'cancelled'
        }, DEMO_USER_ID);
        
        return res.json({
          success: true,
          messageId,
          status: 'cancelled',
          message: 'Message cancelled (no active job found)'
        });
      } catch (updateError) {
        console.error(`❌ [${chatId}] Failed to update message status:`, updateError);
        return res.status(500).json({ error: 'Failed to update message status' });
      }
    }
    
    // Cancel the job
    const cancelled = jobQueue.cancelJob(jobId);
    
    if (cancelled) {
      // Update message status in database
      try {
        updateMessage(chatId, messageId, {
          status: 'cancelled'
        }, DEMO_USER_ID);
        
        console.log(`✅ [${chatId}] Successfully cancelled job ${jobId} and updated message ${messageId}`);
        
        return res.json({
          success: true,
          jobId,
          messageId,
          status: 'cancelled'
        });
      } catch (updateError) {
        console.error(`❌ [${chatId}] Failed to update message status after cancellation:`, updateError);
        return res.status(500).json({ error: 'Job cancelled but failed to update message status' });
      }
    } else {
      return res.status(500).json({ error: 'Failed to cancel job' });
    }
    
  } catch (error) {
    console.error('❌ Cancellation error:', error);
    return res.status(500).json({
      error: 'Failed to cancel message',
      details: error.message
    });
  }
});

// Reload bot response: amend the corresponding blob with new content and keep tracks in an array
router.post('/chats/:id/messages/:messageId/reload', async (req, res) => {
  try {
    const { id: chatId, messageId } = { id: req.params.id, messageId: req.params.messageId };
    const { streaming = true } = req.body || {};
    const chat = findChatById(chatId, DEMO_USER_ID);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    // Find the assistant message
    const msg = chat.messages.find(m => m.id === messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.role !== 'assistant') return res.status(400).json({ error: 'Only assistant messages can be reloaded' });

    // Preserve current content into revisions and reset for regeneration
    beginReloadAssistantMessage(chatId, messageId, DEMO_USER_ID, { streaming });

    // Kick off regeneration using the existing sync handler logic (streaming or not) by simulating a rerun
    // We forward to the appropriate path with rerunOfUserId pointing to its parent user message
    const rerunOfUserId = msg.parentUserId;
    if (!rerunOfUserId) {
      return res.status(400).json({ error: 'Assistant message is missing parentUserId for rerun' });
    }

    // Build a minimal fake request body to reuse handlers
    req.body = {
      message: chat.messages.find(m => m.id === rerunOfUserId)?.content || '',
      context: '',
      domainKnowledge: {},
      modelType: 'ollama',
      model: 'phi3:3.8b',
      stream: streaming,
      mode: streaming ? 'sync' : 'async',
      rerunOfUserId
    };

    if (streaming) {
      return handleSyncMessage(req, res);
    } else {
      return handleAsyncMessage(req, res);
    }
  } catch (error) {
    console.error('❌ Reload bot response error:', error);
    return res.status(500).json({ error: 'Failed to reload response', details: error.message });
  }
});

module.exports = router; 