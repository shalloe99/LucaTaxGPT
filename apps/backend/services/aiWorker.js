const { parentPort, workerData } = require('worker_threads');
const OpenAI = require('openai');

// Initialize OpenAI for worker thread
let openai = null;

function initializeOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  return openai;
}

async function processAIRequest() {
  try {
    const { messages, options } = workerData;
    const { type, model, temperature, maxTokens, messageId } = options;
    
    console.log(`🤖 [Worker] Processing ${type} request for ${model} (Message ID: ${messageId})`);
    
    if (type === 'chatgpt') {
      // Initialize OpenAI
      const openaiClient = initializeOpenAI();
      
      // Make the API call
      const completion = await openaiClient.chat.completions.create({
        model: model || process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
        messages,
        temperature: temperature || parseFloat(process.env.AI_TEMPERATURE) || 0.7,
        max_tokens: maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 2000,
      });
      
      const result = {
        response: completion.choices[0]?.message?.content || '',
        usage: completion.usage,
        model: completion.model,
        provider: 'openai'
      };
      
      console.log(`✅ [Worker] ChatGPT response completed (Message ID: ${messageId})`);
      parentPort.postMessage(result);
      
    } else if (type === 'ollama') {
      // For Ollama, we'll use a simple fetch approach
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const modelName = model || 'phi3:3.8b';
      
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          stream: false,
          options: {
            temperature: temperature || 0.7,
            num_predict: maxTokens || 2000,
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const result = {
        response: data.response || '',
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        model: modelName,
        provider: 'ollama'
      };
      
      console.log(`✅ [Worker] Ollama response completed (Message ID: ${messageId})`);
      parentPort.postMessage(result);
      
    } else {
      throw new Error(`Unknown AI type: ${type}`);
    }
    
  } catch (error) {
    console.error(`❌ [Worker] Error processing request:`, error);
    parentPort.postMessage({ error: error.message });
  }
}

// Start processing when worker receives data
processAIRequest(); 