const { BaseAgent, Task, ExecutionPlan } = require('../../models/AgentEngine');
const { generateAIResponse } = require('../aiService');

/**
 * Planner Agent - Breaks down user requests into structured tasks
 */
class PlannerAgent extends BaseAgent {
  constructor(config = {}) {
    super('planner', 'planner', {
      model: config.model || 'gpt-4o-mini',
      modelType: config.modelType || 'chatgpt',
      maxTasks: config.maxTasks || 20,
      temperature: config.temperature || 0.3,
      ...config
    });
  }

  async execute(input, context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { userRequest, userId, sessionId } = input;
      
      console.log(`🧠 [PlannerAgent] Planning for: "${userRequest.substring(0, 100)}..."`);

      // Build planning prompt
      const planningPrompt = this.buildPlanningPrompt(userRequest, context);
      
      // Generate plan using LLM
      const llmResponse = await generateAIResponse(
        [{ role: 'user', content: planningPrompt }],
        {
          modelType: this.config.modelType,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: 2000,
          messageId: `planner-${sessionId}`,
          stream: false
        }
      );

      const planContent = llmResponse.response || llmResponse.content;
      
      // Parse the LLM response into structured tasks
      const executionPlan = this.parseExecutionPlan(planContent, userRequest, userId);
      
      // Validate the plan
      this.validatePlan(executionPlan);

      const executionTime = Date.now() - startTime;
      this.updateMetrics(true, executionTime);
      this.status = 'idle';

      console.log(`✅ [PlannerAgent] Created plan with ${executionPlan.tasks.length} tasks`);

      return {
        success: true,
        executionPlan,
        metadata: {
          taskCount: executionPlan.tasks.length,
          estimatedDuration: this.estimateDuration(executionPlan),
          complexity: this.assessComplexity(executionPlan),
          llmModel: this.config.model,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(false, executionTime);
      this.status = 'error';
      
      console.error(`❌ [PlannerAgent] Planning failed:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  buildPlanningPrompt(userRequest, context = {}) {
    return `You are a task planner. Break down this request into structured tasks.

REQUEST: "${userRequest}"

Return JSON format:
{
  "summary": "Brief summary",
  "tasks": [
    {
      "description": "Task description",
      "type": "analysis|generation|validation|execution",
      "priority": "high|medium|low",
      "estimatedDuration": "5 minutes",
      "requiredAgent": "executor",
      "requiredTools": ["tool1"],
      "dependencies": [],
      "parameters": {}
    }
  ],
  "riskAssessment": "Risk assessment",
  "successCriteria": "Success criteria"
}

Limit to ${this.config.maxTasks} tasks. Return only JSON.`;
  }

  parseExecutionPlan(llmResponse, originalRequest, userId) {
    try {
      let cleanResponse = llmResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/, '').replace(/```\s*$/, '');
      }

      const planData = JSON.parse(cleanResponse);
      
      const executionPlan = new ExecutionPlan(originalRequest, userId);
      executionPlan.metadata = {
        summary: planData.summary,
        riskAssessment: planData.riskAssessment,
        successCriteria: planData.successCriteria,
        generatedBy: 'PlannerAgent',
        model: this.config.model
      };

      for (const taskData of planData.tasks || []) {
        const task = new Task(
          taskData.description,
          taskData.type,
          taskData.priority || 'medium',
          taskData.dependencies || []
        );
        
        task.estimatedDuration = taskData.estimatedDuration;
        task.requiredAgent = taskData.requiredAgent;
        task.requiredTools = taskData.requiredTools || [];
        task.parameters = taskData.parameters || {};
        
        executionPlan.addTask(task);
      }

      return executionPlan;

    } catch (error) {
      console.error('❌ [PlannerAgent] Failed to parse LLM response:', error);
      return this.createFallbackPlan(originalRequest, userId);
    }
  }

  createFallbackPlan(originalRequest, userId) {
    const executionPlan = new ExecutionPlan(originalRequest, userId);
    executionPlan.metadata = {
      summary: 'Simple execution plan created as fallback',
      generatedBy: 'PlannerAgent (fallback)'
    };

    const task = new Task(
      `Process user request: ${originalRequest}`,
      'general',
      'high',
      []
    );
    
    task.estimatedDuration = '5-10 minutes';
    task.requiredAgent = 'executor';
    task.requiredTools = ['general'];
    task.parameters = { originalRequest };
    
    executionPlan.addTask(task);
    return executionPlan;
  }

  validatePlan(executionPlan) {
    if (!executionPlan || !executionPlan.tasks || executionPlan.tasks.length === 0) {
      throw new Error('Execution plan must contain at least one task');
    }

    if (executionPlan.tasks.length > this.config.maxTasks) {
      throw new Error(`Too many tasks: ${executionPlan.tasks.length}`);
    }
  }

  estimateDuration(executionPlan) {
    const taskCount = executionPlan.tasks.length;
    return `${Math.ceil(taskCount * 4)} minutes`;
  }

  assessComplexity(executionPlan) {
    const taskCount = executionPlan.tasks.length;
    if (taskCount <= 3) return 'low';
    if (taskCount <= 8) return 'medium';
    return 'high';
  }

  validateInput(input) {
    const { userRequest, userId, sessionId } = input;
    return !!(userRequest && userId && sessionId);
  }
}

module.exports = PlannerAgent;