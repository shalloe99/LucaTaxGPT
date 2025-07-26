const express = require('express');
const router = express.Router();
const { chats, createChat } = require('../models/Chat');
const { generateAIResponse, getAvailableModels, getDefaultModel } = require('../services/aiService');

// For now, hardcode userId
const DEMO_USER_ID = "demo-user";

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
  res.status(201).json(conv);
});

// Update/override conversation (title, contextFilters, etc)
router.put('/chats/:id', (req, res) => {
  const idx = chats.findIndex(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  chats[idx] = { ...chats[idx], ...req.body, updatedAt: new Date().toISOString() };
  res.json(chats[idx]);
});

// Delete conversation
router.delete('/chats/:id', (req, res) => {
  const idx = chats.findIndex(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  chats.splice(idx, 1);
  res.json({ success: true });
});

// Add message to conversation (and optionally update contextFilters)
router.post('/chats/:id/messages', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const msg = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...req.body,
    timestamp: new Date().toISOString(),
  };
  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();
  // Optionally update contextFilters if provided
  if (req.body.contextFilters) {
    conv.contextFilters = { ...conv.contextFilters, ...req.body.contextFilters };
  }
  res.status(201).json(msg);
});

// Update/override a message
router.put('/chats/:id/messages/:msgId', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const idx = conv.messages.findIndex(m => m.id === req.params.msgId);
  if (idx === -1) return res.status(404).json({ error: 'Message not found' });
  conv.messages[idx] = { ...conv.messages[idx], ...req.body };
  conv.updatedAt = new Date().toISOString();
  res.json(conv.messages[idx]);
});

// Delete a message
router.delete('/chats/:id/messages/:msgId', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const idx = conv.messages.findIndex(m => m.id === req.params.msgId);
  if (idx === -1) return res.status(404).json({ error: 'Message not found' });
  conv.messages.splice(idx, 1);
  conv.updatedAt = new Date().toISOString();
  res.json({ success: true });
});

// List all messages for a conversation
router.get('/chats/:id/messages', (req, res) => {
  const conv = chats.find(c => c.id === req.params.id && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv.messages);
});

// Get available AI models
router.get('/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    const defaultModel = await getDefaultModel();
    
    res.json({
      models,
      defaultModel
    });
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

// Get default model
router.get('/models/default', async (req, res) => {
  try {
    const defaultModel = await getDefaultModel();
    if (defaultModel) {
      res.json(defaultModel);
    } else {
      res.status(404).json({ error: 'No models available' });
    }
  } catch (error) {
    console.error('Error getting default model:', error);
    res.status(500).json({ error: 'Failed to get default model' });
  }
});

// Get AI service status
router.get('/status', async (req, res) => {
  try {
    const { checkOllamaAvailability, initializeOpenAI } = require('../services/aiService');
    
    const openaiAvailable = initializeOpenAI();
    const ollamaAvailable = await checkOllamaAvailability();
    
    res.json({
      openai: openaiAvailable,
      ollama: ollamaAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking AI service status:', error);
    res.status(500).json({ error: 'Failed to check AI service status' });
  }
});

// Add improved AI chat endpoint with model selection
router.post('/user/messaging/:chatId/', async (req, res) => {
  const conv = chats.find(c => c.id === req.params.chatId && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const { message, context, domainKnowledge, modelType = 'chatgpt', model } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Build system prompt for GPT-4o
    let systemPrompt = `You are a knowledgeable tax assistant with expertise in US tax law and regulations. Your role is to provide accurate, helpful, and clear tax guidance to users.

Key responsibilities:
- Provide accurate tax information based on current US tax laws
- Use clear, professional language that's easy to understand
- Format responses using Markdown for better readability
- Include relevant citations when possible
- Be helpful but always recommend consulting with a qualified tax professional for complex situations

Please format your answers using Markdown, including tables, lists, and code blocks where appropriate. Use clear, readable, and visually appealing Markdown. Do not include any HTML, only Markdown.`;

    // Add context and domain knowledge to system prompt
    if (context) {
      systemPrompt += `\n\nContext Information: ${context}`;
    }
    
    if (domainKnowledge) {
      systemPrompt += `\n\nUser Profile Information:`;
      if (domainKnowledge.federalTaxCode) systemPrompt += `\n- Federal tax code access: enabled`;
      if (domainKnowledge.stateTaxCodes && domainKnowledge.stateTaxCodes.length > 0) {
        systemPrompt += `\n- State tax codes: ${domainKnowledge.stateTaxCodes.join(', ')}`;
      }
      if (domainKnowledge.profileTags && domainKnowledge.profileTags.length > 0) {
        systemPrompt += `\n- User tags: ${domainKnowledge.profileTags.join(', ')}`;
      }
      if (domainKnowledge.filingEntity) {
        systemPrompt += `\n- Filing entity: ${domainKnowledge.filingEntity}`;
      }
    }

    // Find the last user message index
    let lastUserIdx = -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    
    // Cut off all messages after the last user message
    if (lastUserIdx !== -1) {
      conv.messages = conv.messages.slice(0, lastUserIdx + 1);
    }

    // Prepare conversation history for GPT-4o
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (last 10 messages to stay within token limits)
    const recentMessages = conv.messages.slice(-10);
    recentMessages.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    // Add the current user message
    messages.push({
      role: 'user',
      content: message
    });

    console.log(`🤖 Sending request with ${modelType.toUpperCase()}...`);
    console.log(`📝 System prompt length: ${systemPrompt.length} characters`);
    console.log(`💬 Conversation messages: ${messages.length}`);

    // Call AI service with model selection
    const aiResult = await generateAIResponse(messages, {
      modelType: modelType,
      model: model,
      temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
    });

    const aiResponse = aiResult.response || 'I apologize, but I was unable to generate a response. Please try again.';

    console.log(`✅ ${modelType.toUpperCase()} response received`);
    console.log('📊 Usage:', aiResult.usage);

    // Add the AI response to the conversation
    const aiMsg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    conv.messages.push(aiMsg);
    conv.updatedAt = new Date().toISOString();

    res.json({ 
      response: aiResponse,
      usage: aiResult.usage,
      model: aiResult.model,
      provider: aiResult.provider
    });

  } catch (error) {
    console.error(`❌ ${modelType.toUpperCase()} API error:`, error);
    
    // Return appropriate error response
    return res.status(500).json({ 
      error: `Failed to get response from ${modelType.toUpperCase()} assistant.`,
      details: error.message
    });
  }
});

module.exports = router; 