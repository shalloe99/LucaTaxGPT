// const OpenAI = require('openai');
const { searchDocuments } = require('./embeddingService');

// Generate AI response for chat
async function generateResponse(message, chatHistory, relevantDocs, userProfile) {
  try {
    // Build context from relevant documents
    const context = buildContextFromDocuments(relevantDocs);
    
    // Build system prompt
    const systemPrompt = buildSystemPrompt(userProfile);
    
    // Build chat history
    const chatHistory = buildChatHistory(chatHistory);
    
    // Create the completion
    // const completion = await openai.chat.completions.create({
    //   model: "gpt-4",
    //   messages: [
    //     {
    //       role: "system",
    //       content: systemPrompt
    //     },
    //     ...conversationHistory,
    //     {
    //       role: "user",
    //       content: `Context from relevant tax documents:\n${context}\n\nUser question: ${message}`
    //     }
    //   ],
    //   temperature: 0.7,
    //   max_tokens: 1000
    // });
    
    // return completion.choices[0].message.content;
    return "OpenAI temporarily disabled. Please try again later.";
    
  } catch (error) {
    console.error('Error generating response:', error);
    return "I apologize, but I'm having trouble processing your request right now. Please try again later.";
  }
}

// Build context from relevant documents
function buildContextFromDocuments(documents) {
  if (!documents || documents.length === 0) {
    return "No specific tax documents found for this query.";
  }
  
  let context = "Based on the following tax documents:\n\n";
  
  documents.forEach((doc, index) => {
    context += `${index + 1}. ${doc.title} (Form ${doc.formNumber}, ${doc.year})\n`;
    if (doc.tags && doc.tags.length > 0) {
      context += `   Tags: ${doc.tags.join(', ')}\n`;
    }
    if (doc.content) {
      // Include a snippet of the content
      const snippet = doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : '');
      context += `   Content: ${snippet}\n`;
    }
    context += "\n";
  });
  
  return context;
}

// Build system prompt based on user profile
function buildSystemPrompt(userProfile) {
  let prompt = `You are a knowledgeable tax assistant with access to official IRS tax documents and forms. Your role is to help users understand tax-related questions and provide accurate information based on official sources.

Key guidelines:
1. Always base your responses on official tax documents and regulations
2. Be clear and concise in your explanations
3. If you're unsure about something, say so and suggest consulting a tax professional
4. Use simple language to explain complex tax concepts
5. Provide specific references to forms or publications when relevant
6. Consider the user's specific situation and filing entity type`;

  // Add user-specific context
  if (userProfile) {
    if (userProfile.tags && userProfile.tags.length > 0) {
      prompt += `\n\nUser context: ${userProfile.tags.join(', ')}`;
    }
    
    if (userProfile.context) {
      prompt += `\n\nUser situation: ${userProfile.context}`;
    }
    
    if (userProfile.filingEntity) {
      prompt += `\n\nFiling entity type: ${userProfile.filingEntity}`;
    }
  }
  
  prompt += `\n\nRemember to:
- Cite specific forms or publications when providing information
- Explain tax concepts in simple terms
- Warn about deadlines or important requirements
- Suggest when professional help might be needed
- Be helpful but always emphasize that this is for informational purposes only`;
  
  return prompt;
}

// Build chat history for the AI
function buildChatHistory(chatHistory) {
  if (!chatHistory || chatHistory.length === 0) {
    return [];
  }
  
  // Limit to last 10 messages to avoid token limits
  const recentMessages = chatHistory.slice(-10);
  
  return recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// Search for relevant documents based on user query
async function findRelevantDocuments(query, domainKnowledge) {
  try {
    const documents = await searchDocuments(query, domainKnowledge, 3);
    return documents;
  } catch (error) {
    console.error('Error finding relevant documents:', error);
    return [];
  }
}

// Generate follow-up questions
async function generateFollowUpQuestions(chatHistory, userProfile) {
  try {
    const lastMessage = chatHistory[chatHistory.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return [];
    }
    
    // const completion = await openai.chat.completions.create({
    //   model: "gpt-4",
    //   messages: [
    //     {
    //       role: "system",
    //       content: "You are a helpful tax assistant. Generate 2-3 relevant follow-up questions based on the user's situation and the previous response. Make them specific and actionable."
    //     },
    //     {
    //       role: "user",
    //       content: `Based on this response: "${lastMessage.content}" and user profile: ${JSON.stringify(userProfile)}, generate 2-3 follow-up questions. Return as JSON array: ["question1", "question2", "question3"]`
    //     }
    //   ],
    //   temperature: 0.7,
    //   max_tokens: 200
    // });
    
    // const response = completion.choices[0].message.content;
    
    // try {
    //   const questions = JSON.parse(response);
    //   return Array.isArray(questions) ? questions : [];
    // } catch (error) {
    //   // Fallback: extract questions from text
    //   return extractQuestionsFromText(response);
    // }
    return ["OpenAI temporarily disabled. Please try again later."];
    
  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    return [];
  }
}

// Extract questions from text (fallback)
function extractQuestionsFromText(text) {
  const questions = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.endsWith('?') && trimmed.length > 10) {
      questions.push(trimmed);
    }
  }
  
  return questions.slice(0, 3);
}

// Generate document summary for chat context
async function generateDocumentSummary(documentId) {
  try {
    const { getDocumentSummary } = require('./analysisService');
    return await getDocumentSummary(documentId);
  } catch (error) {
    console.error('Error generating document summary:', error);
    return null;
  }
}

// Validate user input
function validateUserInput(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a non-empty string' };
  }
  
  if (message.length > 2000) {
    return { valid: false, error: 'Message too long (max 2000 characters)' };
  }
  
  // Check for potentially harmful content
  const harmfulPatterns = [
    /script/i,
    /javascript:/i,
    /on\w+\s*=/i
  ];
  
  for (const pattern of harmfulPatterns) {
    if (pattern.test(message)) {
      return { valid: false, error: 'Message contains potentially harmful content' };
    }
  }
  
  return { valid: true };
}

// Rate limiting for chat requests
const userRequestCounts = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10; // Max 10 requests per minute
  
  if (!userRequestCounts.has(userId)) {
    userRequestCounts.set(userId, []);
  }
  
  const userRequests = userRequestCounts.get(userId);
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  userRequestCounts.set(userId, recentRequests);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  // Add current request
  recentRequests.push(now);
  userRequestCounts.set(userId, recentRequests);
  
  return true;
}

// Clean up old rate limit data
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  
  for (const [userId, requests] of userRequestCounts.entries()) {
    const recentRequests = requests.filter(time => now - time < windowMs);
    if (recentRequests.length === 0) {
      userRequestCounts.delete(userId);
    } else {
      userRequestCounts.set(userId, recentRequests);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

module.exports = {
  generateResponse,
  findRelevantDocuments,
  generateFollowUpQuestions,
  generateDocumentSummary,
  validateUserInput,
  checkRateLimit
}; 