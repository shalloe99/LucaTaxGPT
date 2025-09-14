const { BaseAgent } = require('../../models/AgentEngine');
const { generateAIResponse } = require('../aiService');

/**
 * Executor Agent - Executes tasks and generates outputs
 */
class ExecutorAgent extends BaseAgent {
  constructor(config = {}) {
    super('executor', 'executor', {
      model: config.model || 'gpt-4o-mini',
      modelType: config.modelType || 'chatgpt',
      temperature: config.temperature || 0.7,
      maxRetries: config.maxRetries || 3,
      ...config
    });
    
    this.supportedTaskTypes = [
      'analysis', 'generation', 'execution', 'general'
    ];
    
    this.supportedTools = [
      'general', 'analyzer', 'generator', 'formatter'
    ];
  }

  async execute(input, context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { task, tools = [], sessionId } = input;
      
      console.log(`⚡ [ExecutorAgent] Executing task: ${task.description.substring(0, 50)}...`);

      // Validate task and tools
      if (!this.canExecuteTask(task)) {
        throw new Error(`Cannot execute task type: ${task.type}`);
      }

      let result;
      let retryCount = 0;
      
      // Execute with retry logic
      while (retryCount <= this.config.maxRetries) {
        try {
          result = await this.executeTask(task, tools, context, sessionId);
          break;
        } catch (error) {
          retryCount++;
          console.warn(`⚠️ [ExecutorAgent] Attempt ${retryCount} failed: ${error.message}`);
          
          if (retryCount > this.config.maxRetries) {
            throw error;
          }
          
          // Wait before retry
          await this.delay(1000 * retryCount);
        }
      }

      const executionTime = Date.now() - startTime;
      this.updateMetrics(true, executionTime);
      this.status = 'idle';

      console.log(`✅ [ExecutorAgent] Task completed in ${executionTime}ms`);

      return {
        success: true,
        result,
        metadata: {
          executionTime,
          retryCount,
          toolsUsed: tools.map(t => t.name)
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(false, executionTime);
      this.status = 'error';
      
      console.error(`❌ [ExecutorAgent] Execution failed:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  async executeTask(task, tools, context, sessionId) {
    const { type, description, parameters = {} } = task;
    
    switch (type) {
      case 'analysis':
        return await this.executeAnalysisTask(task, tools, context, sessionId);
      
      case 'generation':
        return await this.executeGenerationTask(task, tools, context, sessionId);
      
      case 'execution':
        return await this.executeExecutionTask(task, tools, context, sessionId);
      
      case 'general':
      default:
        return await this.executeGeneralTask(task, tools, context, sessionId);
    }
  }

  async executeAnalysisTask(task, tools, context, sessionId) {
    console.log(`🔍 [ExecutorAgent] Performing analysis task`);
    
    const prompt = this.buildAnalysisPrompt(task, context);
    
    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: prompt }],
      {
        modelType: this.config.modelType,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 1500,
        messageId: `executor-analysis-${sessionId}`,
        stream: false
      }
    );

    const analysisResult = llmResponse.response || llmResponse.content;
    
    return {
      type: 'analysis',
      content: analysisResult,
      summary: this.extractSummary(analysisResult),
      confidence: this.assessConfidence(analysisResult),
      recommendations: this.extractRecommendations(analysisResult)
    };
  }

  async executeGenerationTask(task, tools, context, sessionId) {
    console.log(`✨ [ExecutorAgent] Performing generation task`);
    
    const prompt = this.buildGenerationPrompt(task, context);
    
    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: prompt }],
      {
        modelType: this.config.modelType,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 2000,
        messageId: `executor-generation-${sessionId}`,
        stream: false
      }
    );

    const generatedContent = llmResponse.response || llmResponse.content;
    
    return {
      type: 'generation',
      content: generatedContent,
      wordCount: this.countWords(generatedContent),
      format: this.detectFormat(generatedContent),
      quality: this.assessQuality(generatedContent)
    };
  }

  async executeExecutionTask(task, tools, context, sessionId) {
    console.log(`🔧 [ExecutorAgent] Performing execution task`);
    
    // For execution tasks, we might need to call tools or perform actions
    const availableTools = tools.filter(tool => tool.enabled !== false);
    
    if (availableTools.length > 0) {
      return await this.executeWithTools(task, availableTools, context);
    } else {
      return await this.executeWithLLM(task, context, sessionId);
    }
  }

  async executeGeneralTask(task, tools, context, sessionId) {
    console.log(`🔄 [ExecutorAgent] Performing general task`);
    
    const prompt = this.buildGeneralPrompt(task, context);
    
    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: prompt }],
      {
        modelType: this.config.modelType,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 1500,
        messageId: `executor-general-${sessionId}`,
        stream: false
      }
    );

    const result = llmResponse.response || llmResponse.content;
    
    return {
      type: 'general',
      content: result,
      summary: this.extractSummary(result),
      actionItems: this.extractActionItems(result)
    };
  }

  async executeWithTools(task, tools, context) {
    const results = [];
    
    for (const tool of tools) {
      try {
        console.log(`🔨 [ExecutorAgent] Using tool: ${tool.name}`);
        
        const toolResult = await tool.execute(task.parameters, {
          ...context,
          task
        });
        
        results.push({
          tool: tool.name,
          success: true,
          result: toolResult
        });
        
      } catch (toolError) {
        console.error(`❌ [ExecutorAgent] Tool ${tool.name} failed:`, toolError);
        
        results.push({
          tool: tool.name,
          success: false,
          error: toolError.message
        });
      }
    }
    
    return {
      type: 'execution',
      toolResults: results,
      summary: this.summarizeToolResults(results),
      successCount: results.filter(r => r.success).length,
      totalCount: results.length
    };
  }

  async executeWithLLM(task, context, sessionId) {
    const prompt = `You are an execution agent. Execute this task:

TASK: ${task.description}
PARAMETERS: ${JSON.stringify(task.parameters, null, 2)}
CONTEXT: ${JSON.stringify(context, null, 2)}

Provide a detailed execution result with clear outcomes and any generated artifacts.`;

    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: prompt }],
      {
        modelType: this.config.modelType,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 1500,
        messageId: `executor-llm-${sessionId}`,
        stream: false
      }
    );

    return {
      type: 'execution',
      content: llmResponse.response || llmResponse.content,
      executedBy: 'LLM',
      model: this.config.model
    };
  }

  buildAnalysisPrompt(task, context) {
    return `Analyze the following request and provide detailed insights:

TASK: ${task.description}
PARAMETERS: ${JSON.stringify(task.parameters, null, 2)}

Please provide:
1. Key findings and insights
2. Data analysis (if applicable)
3. Patterns or trends identified
4. Risk assessment
5. Recommendations for next steps

Be thorough and specific in your analysis.`;
  }

  buildGenerationPrompt(task, context) {
    return `Generate content based on the following requirements:

TASK: ${task.description}
PARAMETERS: ${JSON.stringify(task.parameters, null, 2)}

Requirements:
- Create high-quality, relevant content
- Follow any specified format or style guidelines
- Ensure accuracy and completeness
- Make it engaging and useful

Generate the requested content now.`;
  }

  buildGeneralPrompt(task, context) {
    return `Complete the following task:

TASK: ${task.description}
PARAMETERS: ${JSON.stringify(task.parameters, null, 2)}

Provide a comprehensive response that addresses all aspects of the task.
Include specific details, actionable steps, and clear outcomes.`;
  }

  canExecuteTask(task) {
    return this.supportedTaskTypes.includes(task.type) || task.type === 'general';
  }

  extractSummary(content) {
    // Simple summary extraction - take first 200 characters
    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }

  extractRecommendations(content) {
    // Simple recommendation extraction
    const lines = content.split('\n');
    return lines.filter(line => 
      line.toLowerCase().includes('recommend') || 
      line.toLowerCase().includes('suggest') ||
      line.includes('•') ||
      line.match(/^\d+\./)
    ).slice(0, 5);
  }

  extractActionItems(content) {
    // Simple action item extraction
    const lines = content.split('\n');
    return lines.filter(line =>
      line.toLowerCase().includes('action') ||
      line.toLowerCase().includes('next step') ||
      line.toLowerCase().includes('todo') ||
      line.includes('[ ]') ||
      line.match(/^\d+\./)
    ).slice(0, 5);
  }

  assessConfidence(content) {
    // Simple confidence assessment based on content quality indicators
    let confidence = 50;
    
    if (content.length > 500) confidence += 20;
    if (content.includes('analysis') || content.includes('data')) confidence += 10;
    if (content.includes('recommend') || content.includes('suggest')) confidence += 10;
    if (content.split('\n').length > 5) confidence += 10;
    
    return Math.min(100, confidence);
  }

  countWords(text) {
    return text.trim().split(/\s+/).length;
  }

  detectFormat(content) {
    if (content.includes('```')) return 'code';
    if (content.includes('|') && content.includes('-')) return 'table';
    if (content.includes('•') || content.match(/^\d+\./m)) return 'list';
    return 'text';
  }

  assessQuality(content) {
    let score = 50;
    
    if (content.length > 300) score += 20;
    if (content.includes('\n\n')) score += 10; // Paragraphs
    if (content.match(/[.!?]/g) && content.match(/[.!?]/g).length > 2) score += 10;
    if (!/(.)\1{3,}/.test(content)) score += 10; // No excessive repetition
    
    return Math.min(100, score);
  }

  summarizeToolResults(results) {
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    return `Executed ${total} tools: ${successful} successful, ${total - successful} failed`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  validateInput(input) {
    const { task, sessionId } = input;
    
    if (!task || !task.description || !task.type) {
      return false;
    }
    
    if (!sessionId) {
      return false;
    }
    
    return true;
  }
}

module.exports = ExecutorAgent;
