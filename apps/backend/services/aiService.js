const OpenAI = require('openai');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

// Use native fetch (Node 18+) or undici for better streaming support
const fetch = globalThis.fetch || require('undici').fetch;

// Initialize OpenAI client
let openai = null;
let openaiInitialized = false;

// Worker thread pool for AI processing
const workerPool = new Map();
const MAX_WORKERS = 4; // Limit concurrent workers

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
      console.error('❌ Invalid OPENAI_API_KEY format');
      console.error('API key should start with "sk-" and be a valid OpenAI key');
      return false;
    }
    
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 second timeout
    });
    
    openaiInitialized = true;
    return true;
  } catch (error) {
    return false;
  }
}

// Check Ollama availability with GPU support
async function checkOllamaAvailability() {
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    
    // Check basic availability
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      // Check for GPU support
      try {
        const gpuResponse = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'phi3:3.8b',
            prompt: 'test',
            stream: false,
            options: {
              num_gpu: 1, // Try to use GPU
              num_thread: 4 // Use multiple threads
            }
          }),
          signal: AbortSignal.timeout(3000)
        });
        
        if (gpuResponse.ok) {
          return { available: true, gpu: true };
        } else {
          return { available: true, gpu: false };
        }
      } catch (gpuError) {
        return { available: true, gpu: false };
      }
    }
    
    return { available: false, gpu: false };
  } catch (error) {
    return { available: false, gpu: false };
  }
}

// Worker thread for AI processing
function createAIWorker(messages, options) {
  return new Promise((resolve, reject) => {
    const workerStartTime = Date.now();
    const worker = new Worker(path.join(__dirname, 'aiWorker.js'), {
      workerData: { messages, options }
    });
    
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('AI processing timeout - request took too long'));
    }, 1800000); // 30 minute timeout for local models (extended for cloud LLM)
    
    worker.on('message', (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    
    worker.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    
    worker.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// Generate ChatGPT response with worker thread
async function generateChatGPTResponse(messages, options = {}) {
  const chatgptStartTime = Date.now();
  if (!openaiInitialized) {
    throw new Error('OpenAI not initialized');
  }
  
  const {
    model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
    temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
    stream = false,
    messageId = 'unknown'
  } = options;
  
  console.log(`🤖 [ChatGPT] Starting request for ${model} (stream: ${stream}, Message ID: ${messageId})`);
  
  try {
    if (stream) {
      // For streaming, we need to handle it differently
      console.log(`🔍 [ChatGPT] Creating streaming request for ${model} (Message ID: ${messageId})`);
      console.log(`📤 [ChatGPT] Messages being sent:`, JSON.stringify(messages).substring(0, 300) + '...');
      const stream = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });
      
      console.log(`✅ [ChatGPT] Streaming response received (Message ID: ${messageId})`);
      console.log(`🔍 [ChatGPT] Stream object type:`, typeof stream, stream ? 'exists' : 'null');
      
      // Test if the stream is actually iterable
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        console.log(`✅ [ChatGPT] Stream is async iterable`);
      } else {
        console.log(`❌ [ChatGPT] Stream is not async iterable`);
      }
      
      return { stream, model, provider: 'openai' };
    } else {
      // Use direct call for non-streaming to prevent worker thread issues
      const result = await generateChatGPTResponseDirect(messages, {
        model,
        temperature,
        maxTokens,
        messageId
      });
      
      console.log(`✅ [ChatGPT] Response received (Message ID: ${messageId})`);
      return result;
    }
  } catch (error) {
    console.error(`❌ [ChatGPT] Error (Message ID: ${messageId}):`, error.message);
    console.error(`❌ [ChatGPT] Full error:`, error);
    throw error;
  }
}

// Generate ChatGPT response directly (for worker threads)
async function generateChatGPTResponseDirect(messages, options = {}) {
  const chatgptStartTime = Date.now();
  if (!openaiInitialized) {
    throw new Error('OpenAI not initialized');
  }
  
  const {
    model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
    temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
    messageId = 'unknown'
  } = options;
  
  console.log(`🤖 [ChatGPT Direct] Starting request for ${model} (Message ID: ${messageId})`);
  
  try {
    // Direct call without streaming
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    });
    
    const response = completion.choices[0]?.message?.content || 'No response generated';
    const usage = completion.usage;
    
    console.log(`✅ [ChatGPT Direct] Response received (Message ID: ${messageId})`);
    
    return {
      response,
      usage,
      model,
      provider: 'openai'
    };
  } catch (error) {
    console.error(`❌ [ChatGPT Direct] Error (Message ID: ${messageId}):`, error.message);
    throw error;
  }
}

// Generate Ollama response with GPU acceleration
async function generateOllamaResponse(messages, options = {}) {
  const ollamaStartTime = Date.now();
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const {
    model = 'phi3:3.8b',
    temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
    stream = false,
    messageId = 'unknown'
  } = options;
  
  console.log(`🤖 [Ollama] Starting request for ${model} (stream: ${stream}, Message ID: ${messageId})`);
  
  try {
    // Check Ollama availability and model existence
    const { available, gpu } = await checkOllamaAvailability();
    
    if (!available) {
      throw new Error('Ollama service is not available. Please ensure Ollama is running.');
    }
    
    // Skip model check for performance - model errors will be caught in the actual request
    
    const requestData = {
      model,
      messages,
      temperature,
      num_predict: maxTokens,
      stream,
      options: {
        num_gpu: gpu ? 1 : 0, // Use GPU if available
        num_thread: 4, // Use multiple CPU threads
        num_ctx: 4096, // Context window
        repeat_penalty: 1.1, // Prevent repetition
        top_k: 40,
        top_p: 0.9
      }
    };
    
    if (stream) {
      // For streaming, use fetch with proper stream handling
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal: AbortSignal.timeout(1800000) // 30 minute timeout for slower models (extended for cloud LLM)
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }
      
      console.log(`✅ [Ollama] Streaming response received (Message ID: ${messageId})`);
      
      // Return the readable stream
      return { stream: response.body, model, provider: 'ollama' };
    } else {
      // Use direct call for non-streaming to prevent worker thread issues
      const result = await generateOllamaResponseDirect(messages, {
        model,
        temperature,
        maxTokens,
        gpu,
        messageId
      });
      
      console.log(`✅ [Ollama] Response received (Message ID: ${messageId})`);
      return result;
    }
  } catch (error) {
    console.error(`❌ [Ollama] Error (Message ID: ${messageId}):`, error.message);
    throw error;
  }
}

// Generate Ollama response directly (for worker threads)
async function generateOllamaResponseDirect(messages, options = {}) {
  const ollamaStartTime = Date.now();
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const {
    model = 'phi3:3.8b',
    temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
    gpu = false,
    messageId = 'unknown'
  } = options;
  
  console.log(`🤖 [Ollama Direct] Starting request for ${model} (Message ID: ${messageId})`);
  
  try {
    // Check Ollama availability and model existence
    const { available, gpu: gpuAvailable } = await checkOllamaAvailability();
    
    if (!available) {
      throw new Error('Ollama service is not available. Please ensure Ollama is running.');
    }
    
    // Skip model check for performance - model errors will be caught in the actual request
    
    const requestData = {
      model,
      messages,
      temperature,
      num_predict: maxTokens,
      stream: false,
      options: {
        num_gpu: gpu && gpuAvailable ? 1 : 0, // Use GPU if available and requested
        num_thread: 4, // Use multiple CPU threads
        num_ctx: 4096, // Context window
        repeat_penalty: 1.1, // Prevent repetition
        top_k: 40,
        top_p: 0.9
      }
    };
    
    // Direct call without streaming
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      signal: AbortSignal.timeout(1800000) // 30 minute timeout for slower models (extended for cloud LLM)
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const aiResponse = data.message?.content || 'No response generated';
    
    console.log(`✅ [Ollama Direct] Response received (Message ID: ${messageId})`);
    
    return {
      response: aiResponse,
      model,
      provider: 'ollama'
    };
  } catch (error) {
    console.error(`❌ [Ollama Direct] Error (Message ID: ${messageId}):`, error.message);
    throw error;
  }
}

// Main AI response generator with worker thread support
async function generateAIResponse(messages, options = {}) {
  const aiStartTime = Date.now();
  const {
    modelType = 'ollama',
    model,
    temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 2000,
    stream = false,
    messageId = 'unknown',
    onChunk = null
  } = options;
  
  console.log(`🤖 [AI] Starting ${modelType} generation for ${model} (Message ID: ${messageId})`);
  
  try {
    // Validate inputs
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }
    
    if (!model) {
      throw new Error('Model is required');
    }
    
    let result;
    if (modelType === 'chatgpt') {
      result = await generateChatGPTResponse(messages, {
        model,
        temperature,
        maxTokens,
        stream,
        messageId
      });
      
      // Handle streaming case for ChatGPT
      if (stream && result.stream && onChunk) {
        console.log(`🌊 [AI] Processing ChatGPT stream for ${messageId}`);
        let fullContent = '';
        
        try {
          for await (const chunk of result.stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              
              // Call the onChunk callback for each token
              onChunk({ content });
            }
          }
        } catch (streamError) {
          console.error(`❌ [AI] ChatGPT streaming error for ${messageId}:`, streamError);
        }
        
        // Return final result with accumulated content
        result = {
          content: fullContent,
          usage: { prompt_tokens: 0, completion_tokens: fullContent.length, total_tokens: fullContent.length },
          model: result.model,
          provider: result.provider
        };
      }
    } else if (modelType === 'ollama') {
      result = await generateOllamaResponse(messages, {
        model,
        temperature,
        maxTokens,
        stream,
        messageId,
        onChunk
      });
      
      // Handle streaming case for Ollama
      if (stream && result.stream && onChunk) {
        console.log(`🌊 [AI] Processing Ollama stream for ${messageId}`);
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.trim() && line.startsWith('{')) {
                try {
                  const data = JSON.parse(line);
                  if (data.message && data.message.content) {
                    const content = data.message.content;
                    fullContent += content;
                    
                    // Call the onChunk callback
                    onChunk({ content });
                  }
                } catch (parseError) {
                  // Ignore parse errors for incomplete chunks
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        // Return final result with accumulated content
        result = {
          content: fullContent,
          usage: { prompt_tokens: 0, completion_tokens: fullContent.length, total_tokens: fullContent.length },
          model: result.model,
          provider: result.provider
        };
      }
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }
    
    const duration = Date.now() - aiStartTime;
    console.log(`✅ [AI] ${modelType} generation completed in ${duration}ms (Message ID: ${messageId})`);
    return result;
  } catch (error) {
    const duration = Date.now() - aiStartTime;
    console.error(`❌ [AI] ${modelType} generation error after ${duration}ms (Message ID: ${messageId}):`, error.message);
    console.error('Stack trace:', error.stack);
    
    // Provide more specific error messages for common issues
    if (modelType === 'ollama') {
      if (error.message.includes('Ollama service is not available')) {
        throw new Error('Ollama service is not available. Please ensure Ollama is running on your system.');
      } else if (error.message.includes('Model') && error.message.includes('not available')) {
        throw new Error(`Model '${model}' is not available. Please install it using: ollama pull ${model}`);
      } else if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        throw new Error('Unable to connect to Ollama service. Please check if Ollama is running and accessible.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Ollama request timed out. The model may be busy or overloaded.');
      }
    } else if (modelType === 'chatgpt') {
      if (error.message.includes('API key') || error.message.includes('authentication')) {
        throw new Error('OpenAI API key is invalid or missing. Please check your configuration.');
      } else if (error.message.includes('quota') || error.message.includes('billing')) {
        throw new Error('OpenAI API quota exceeded or billing issue. Please check your OpenAI account.');
      } else if (error.message.includes('timeout')) {
        throw new Error('OpenAI request timed out. Please try again.');
      }
    }
    
    // Return a safe fallback response instead of crashing
    return {
      content: `I apologize, but I encountered an error while processing your request: ${error.message}. Please try again or contact support if the issue persists.`,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: model,
      provider: modelType,
      error: true,
      errorMessage: error.message
    };
  }
}

// Get available models with GPU information
async function getAvailableModels() {
  const models = {
    chatgpt: [],
    ollama: []
  };
  
  // Check OpenAI availability
  if (initializeOpenAI()) {
    models.chatgpt = [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        description: 'Most capable GPT-4 model',
        maxTokens: 4096
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        description: 'Fast and cost-effective GPT-4 model',
        maxTokens: 4096
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        description: 'Fast and efficient model',
        maxTokens: 4096
      }
    ];
  }
  
  // Check Ollama availability with GPU info
  const ollamaStatus = await checkOllamaAvailability();
  if (ollamaStatus.available) {
    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.models) {
          models.ollama = data.models.map(model => ({
            id: model.name,
            name: model.name,
            provider: 'ollama',
            description: `Local model (${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB)${ollamaStatus.gpu ? ' - GPU Enabled' : ' - CPU Only'}`,
            size: model.size,
            gpu: ollamaStatus.gpu
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
    }
  }
  
  return models;
}

// Get default model with GPU preference
async function getDefaultModel() {
  const models = await getAvailableModels();
  
  // Prefer GPU-enabled Ollama models
  const gpuOllamaModels = models.ollama.filter(m => m.gpu);
  if (gpuOllamaModels.length > 0) {
    const phi3 = gpuOllamaModels.find(m => m.id === 'phi3:3.8b');
    if (phi3) {
      return {
        modelType: 'ollama',
        model: phi3.id,
        modelInfo: phi3
      };
    }
    return {
      modelType: 'ollama',
      model: gpuOllamaModels[0].id,
      modelInfo: gpuOllamaModels[0]
    };
  }
  
  // Fallback to CPU Ollama models
  if (models.ollama.length > 0) {
    const phi3 = models.ollama.find(m => m.id === 'phi3:3.8b');
    if (phi3) {
      return {
        modelType: 'ollama',
        model: phi3.id,
        modelInfo: phi3
      };
    }
    return {
      modelType: 'ollama',
      model: models.ollama[0].id,
      modelInfo: models.ollama[0]
    };
  }
  
  // Fallback to ChatGPT
  if (models.chatgpt.length > 0) {
    return {
      modelType: 'chatgpt',
      model: 'gpt-4o-mini',
      modelInfo: models.chatgpt.find(m => m.id === 'gpt-4o-mini') || models.chatgpt[0]
    };
  }
  
  return null;
}

// Initialize all services
async function initializeServices() {
  console.log('🚀 Initializing AI services...');
  
  try {
    // Initialize OpenAI
    const openaiAvailable = initializeOpenAI();
    
    // Check Ollama with GPU
    let ollamaStatus = { available: false, gpu: false };
    try {
      ollamaStatus = await checkOllamaAvailability();
    } catch (ollamaError) {
      console.warn('⚠️ Ollama availability check failed:', ollamaError.message);
    }
    
    console.log('📊 AI Service Status:');
    console.log(`  OpenAI: ${openaiAvailable ? '✅ Available' : '❌ Not available'}`);
    console.log(`  Ollama: ${ollamaStatus.available ? '✅ Available' : '❌ Not available'}`);
    if (ollamaStatus.available) {
      console.log(`  GPU Support: ${ollamaStatus.gpu ? '✅ Enabled' : '⚠️ CPU Only'}`);
    }
    
    return {
      openai: openaiAvailable,
      ollama: ollamaStatus.available,
      gpu: ollamaStatus.gpu
    };
  } catch (error) {
    console.error('❌ Error initializing AI services:', error);
    console.error('Stack trace:', error.stack);
    
    // Return a safe default status
    return {
      openai: false,
      ollama: false,
      gpu: false
    };
  }
}

// Cleanup worker threads
function cleanup() {
  for (const [id, worker] of workerPool) {
    worker.terminate();
  }
  workerPool.clear();
}

module.exports = {
  initializeOpenAI,
  checkOllamaAvailability,
  generateAIResponse,
  generateChatGPTResponse,
  generateChatGPTResponseDirect,
  generateOllamaResponse,
  generateOllamaResponseDirect,
  getAvailableModels,
  getDefaultModel,
  initializeServices,
  cleanup
}; 