const axios = require('axios');
const OpenAI = require('openai');

// Initialize OpenAI client
let openai = null;
let openaiInitialized = false;

// Initialize OpenAI if API key is available
function initializeOpenAI() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY is not set in environment variables');
      console.error('Please add OPENAI_API_KEY to your .env file');
      console.error('Example: OPENAI_API_KEY=sk-your-api-key-here');
      return false;
    }
    
    // Check if API key is the default placeholder
    if (process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here' || 
        process.env.OPENAI_API_KEY === '' || 
        !process.env.OPENAI_API_KEY.startsWith('sk-')) {
      console.error('❌ OPENAI_API_KEY is not properly configured');
      console.error('Please set a valid OpenAI API key in your .env file');
      return false;
    }
    
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    openaiInitialized = true;
    console.log('✅ OpenAI client initialized successfully');
    console.log(`📋 Using model: ${process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini'}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI client:', error.message);
    return false;
  }
}

// Check if Ollama is available
async function checkOllamaAvailability() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 5000
    });
    console.log('✅ Ollama is available');
    const modelNames = response.data.models?.map(m => m.name) || [];
    console.log('📋 Available models:', modelNames);
    return true;
  } catch (error) {
    console.error('❌ Ollama is not available:', error.message);
    console.error('💡 Make sure Ollama is running on http://localhost:11434');
    return false;
  }
}

// Generate response using ChatGPT
async function generateChatGPTResponse(messages, options = {}) {
  if (!openaiInitialized) {
    throw new Error('OpenAI client not initialized. Check OPENAI_API_KEY configuration.');
  }

  const model = options.model || process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';
  const temperature = options.temperature || parseFloat(process.env.AI_TEMPERATURE) || 0.7;
  const maxTokens = options.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 2000;

  console.log(`🤖 Sending request to ${model}...`);
  console.log(`📝 Messages count: ${messages.length}`);
  console.log(`🌡️ Temperature: ${temperature}`);
  console.log(`🔢 Max tokens: ${maxTokens}`);

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const response = completion.choices[0]?.message?.content;
    console.log('✅ ChatGPT response received');
    console.log('📊 Usage:', completion.usage);

    return {
      response,
      usage: completion.usage,
      model: model,
      provider: 'openai'
    };
  } catch (error) {
    console.error('❌ ChatGPT API error:', error);
    
    // Provide specific error messages based on error type
    if (error.code === 'insufficient_quota') {
      throw new Error('API quota exceeded. Please check your OpenAI account billing.');
    } else if (error.code === 'invalid_api_key') {
      throw new Error('Invalid API key. Please check your OPENAI_API_KEY configuration.');
    } else if (error.code === 'rate_limit_exceeded') {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    } else {
      throw new Error(`ChatGPT API error: ${error.message}`);
    }
  }
}

// Generate response using Ollama
async function generateOllamaResponse(messages, options = {}) {
  const model = options.model || 'llama2';
  const temperature = options.temperature || 0.7;
  const maxTokens = options.maxTokens || 2000;

  console.log(`🤖 Sending request to Ollama (${model})...`);
  console.log(`📝 Messages count: ${messages.length}`);
  console.log(`🌡️ Temperature: ${temperature}`);
  console.log(`🔢 Max tokens: ${maxTokens}`);

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: model,
      messages: messages,
      options: {
        temperature: temperature,
        num_predict: maxTokens,
      },
      stream: false
    }, {
      timeout: 60000 // 60 second timeout
    });

    const aiResponse = response.data.message?.content;
    console.log('✅ Ollama response received');

    return {
      response: aiResponse,
      usage: {
        prompt_tokens: 0, // Ollama doesn't provide token usage
        completion_tokens: 0,
        total_tokens: 0
      },
      model: model,
      provider: 'ollama'
    };
  } catch (error) {
    console.error('❌ Ollama API error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Ollama is not running. Please start Ollama on http://localhost:11434');
    } else if (error.response?.status === 404) {
      throw new Error(`Model '${model}' not found in Ollama. Please pull the model first.`);
    } else {
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }
}

// Main function to generate AI response
async function generateAIResponse(messages, options = {}) {
  const modelType = options.modelType || 'chatgpt'; // 'chatgpt' or 'ollama'
  const model = options.model;
  
  console.log(`🚀 Generating AI response with ${modelType.toUpperCase()}`);
  
  try {
    if (modelType === 'chatgpt') {
      return await generateChatGPTResponse(messages, options);
    } else if (modelType === 'ollama') {
      return await generateOllamaResponse(messages, options);
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }
  } catch (error) {
    console.error(`❌ Error generating ${modelType} response:`, error.message);
    throw error;
  }
}

// Get available models
async function getAvailableModels() {
  const models = {
    chatgpt: [],
    ollama: []
  };

  // Check ChatGPT availability by testing the API key directly
  if (process.env.OPENAI_API_KEY) {
    try {
      // Test if we can create an OpenAI client
      const testOpenAI = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      // If we can create the client, ChatGPT models are available
      models.chatgpt = [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          provider: 'openai',
          description: 'Most capable GPT-4 model'
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          provider: 'openai',
          description: 'Faster and more cost-effective GPT-4 model'
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          provider: 'openai',
          description: 'Fast and efficient model'
        }
      ];
    } catch (error) {
      console.log('⚠️ OpenAI API key present but client creation failed:', error.message);
    }
  }

  // Check Ollama availability
  try {
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 5000
    });
    
    if (response.data.models) {
      models.ollama = response.data.models.map(model => ({
        id: model.name,
        name: model.name,
        provider: 'ollama',
        description: `Local model (${model.size ? `${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB` : 'Unknown size'})`
      }));
    }
  } catch (error) {
    console.log('⚠️ Ollama not available for model listing');
  }

  return models;
}

// Get the best default model based on availability
async function getDefaultModel() {
  const models = await getAvailableModels();
  
  // Priority: GPT-3.5 Turbo > GPT-4o Mini > GPT-4o > First local model
  if (models.chatgpt.length > 0) {
    // Look for GPT-3.5 Turbo first
    const gpt35Turbo = models.chatgpt.find(m => m.id === 'gpt-3.5-turbo');
    if (gpt35Turbo) {
      return {
        modelType: 'chatgpt',
        model: 'gpt-3.5-turbo',
        modelInfo: gpt35Turbo
      };
    }
    
    // Fallback to first available ChatGPT model
    return {
      modelType: 'chatgpt',
      model: models.chatgpt[0].id,
      modelInfo: models.chatgpt[0]
    };
  }
  
  // If no ChatGPT models, use first local model
  if (models.ollama.length > 0) {
    return {
      modelType: 'ollama',
      model: models.ollama[0].id,
      modelInfo: models.ollama[0]
    };
  }
  
  // No models available
  return null;
}

// Initialize services on startup
async function initializeServices() {
  console.log('🔧 Initializing AI services...');
  
  // Initialize OpenAI
  const openaiAvailable = initializeOpenAI();
  
  // Check Ollama
  const ollamaAvailable = await checkOllamaAvailability();
  
  if (!openaiAvailable && !ollamaAvailable) {
    console.error('❌ No AI services are available!');
    console.error('💡 Please configure either:');
    console.error('   - OpenAI API key for ChatGPT');
    console.error('   - Ollama for local models');
    return false;
  }
  
  console.log('✅ AI services initialization complete');
  return true;
}

module.exports = {
  generateAIResponse,
  getAvailableModels,
  getDefaultModel,
  initializeServices,
  initializeOpenAI,
  checkOllamaAvailability,
  generateChatGPTResponse,
  generateOllamaResponse
}; 