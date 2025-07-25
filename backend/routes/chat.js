const express = require('express');
const router = express.Router();
const { chats, createChat } = require('../models/Chat');
const axios = require('axios');

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

// Add improved AI chat endpoint
router.post('/user/messaging/:chatId/', async (req, res) => {
  const conv = chats.find(c => c.id === req.params.chatId && c.userId === DEMO_USER_ID);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const { message, context, domainKnowledge } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Build prompt for LLM
  let prompt = `You are a knowledgeable tax assistant. Use the following context and user information to answer the question.\n\nPlease format your answer using Markdown, including tables, lists, and code blocks where appropriate. Use clear, readable, and visually appealing Markdown. Do not include any HTML, only Markdown.\n`;
  if (context) prompt += `\nContext: ${context}`;
  if (domainKnowledge) {
    if (domainKnowledge.federalTaxCode) prompt += `\nFederal tax code: enabled`;
    if (domainKnowledge.stateTaxCodes && domainKnowledge.stateTaxCodes.length > 0) prompt += `\nState tax codes: ${domainKnowledge.stateTaxCodes.join(', ')}`;
    if (domainKnowledge.profileTags && domainKnowledge.profileTags.length > 0) prompt += `\nUser tags: ${domainKnowledge.profileTags.join(', ')}`;
    if (domainKnowledge.filingEntity) prompt += `\nFiling entity: ${domainKnowledge.filingEntity}`;
  }
  prompt += `\n\nUser: ${message}`;

  try {
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
    // Comment out the local Ollama API call for now
    // const ollamaRes = await axios.post('http://localhost:11434/api/generate', {
    //   model: 'llama3.2:latest',
    //   prompt,
    //   stream: false
    // });
    // const aiResponse = ollamaRes.data.response || ollamaRes.data.message || ollamaRes.data;
    const aiResponse = 'hi back'; // Temporary fast response
    // Only append the bot reply
    const aiMsg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    conv.messages.push(aiMsg);
    conv.updatedAt = new Date().toISOString();
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Ollama LLM error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get response from AI agent.' });
  }
});

module.exports = router; 