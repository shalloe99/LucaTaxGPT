const { BaseAgent } = require('../../models/AgentEngine');

/**
 * Router Agent - Selects the right Executor Agents for tasks
 */
class RouterAgent extends BaseAgent {
  constructor(config = {}) {
    super('router', 'router', {
      ...config
    });
    
    this.agentRegistry = new Map();
    this.toolRegistry = new Map();
    this.routingRules = new Map();
    
    this.initializeDefaultRules();
  }

  async execute(input, context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { tasks, availableAgents = [], availableTools = [] } = input;
      
      console.log(`🧭 [RouterAgent] Routing ${tasks.length} tasks`);

      // Update registries with available agents and tools
      this.updateRegistries(availableAgents, availableTools);
      
      const routingResults = [];
      
      for (const task of tasks) {
        const routing = await this.routeTask(task, context);
        routingResults.push(routing);
      }

      const executionTime = Date.now() - startTime;
      this.updateMetrics(true, executionTime);
      this.status = 'idle';

      console.log(`✅ [RouterAgent] Routed ${routingResults.length} tasks`);

      return {
        success: true,
        routings: routingResults,
        metadata: {
          totalTasks: tasks.length,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(false, executionTime);
      this.status = 'error';
      
      console.error(`❌ [RouterAgent] Routing failed:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  async routeTask(task, context) {
    console.log(`🔍 [RouterAgent] Routing task: ${task.description.substring(0, 50)}...`);
    
    try {
      // Find best agent for this task
      const selectedAgent = this.selectAgent(task);
      
      // Find required tools
      const selectedTools = this.selectTools(task);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(task, selectedAgent, selectedTools);
      
      const routing = {
        taskId: task.id,
        selectedAgent,
        selectedTools,
        confidence,
        reasoning: this.generateReasoning(task, selectedAgent, selectedTools),
        fallbackOptions: this.getFallbackOptions(task)
      };

      console.log(`✅ [RouterAgent] Task ${task.id} → Agent: ${selectedAgent?.type || 'none'}, Tools: ${selectedTools.length}`);
      
      return routing;

    } catch (error) {
      console.error(`❌ [RouterAgent] Failed to route task ${task.id}:`, error);
      
      return {
        taskId: task.id,
        selectedAgent: null,
        selectedTools: [],
        confidence: 0,
        reasoning: `Failed to route: ${error.message}`,
        fallbackOptions: []
      };
    }
  }

  selectAgent(task) {
    // Priority 1: Task explicitly specifies required agent
    if (task.requiredAgent) {
      const agent = this.findAgentByType(task.requiredAgent);
      if (agent) return agent;
    }

    // Priority 2: Use routing rules based on task type
    const ruleAgentType = this.routingRules.get(task.type);
    if (ruleAgentType) {
      const agent = this.findAgentByType(ruleAgentType);
      if (agent) return agent;
    }

    // Priority 3: Find best match based on capabilities
    const candidates = Array.from(this.agentRegistry.values())
      .filter(agent => agent.enabled !== false)
      .map(agent => ({
        agent,
        score: this.scoreAgentForTask(agent, task)
      }))
      .sort((a, b) => b.score - a.score);

    return candidates.length > 0 ? candidates[0].agent : null;
  }

  selectTools(task) {
    const selectedTools = [];
    
    // Add explicitly required tools
    if (task.requiredTools && task.requiredTools.length > 0) {
      for (const toolName of task.requiredTools) {
        const tool = this.toolRegistry.get(toolName);
        if (tool && tool.enabled !== false) {
          selectedTools.push(tool);
        }
      }
    }

    // Add tools based on task type
    const typeBased = this.getToolsForTaskType(task.type);
    for (const tool of typeBased) {
      if (!selectedTools.find(t => t.name === tool.name)) {
        selectedTools.push(tool);
      }
    }

    return selectedTools;
  }

  findAgentByType(agentType) {
    return Array.from(this.agentRegistry.values())
      .find(agent => agent.type === agentType && agent.enabled !== false);
  }

  scoreAgentForTask(agent, task) {
    let score = 0;
    
    // Base score by agent type
    const typeScores = {
      'executor': 80,
      'validator': 60,
      'analyzer': 70,
      'generator': 75
    };
    score += typeScores[agent.type] || 50;
    
    // Bonus for task type match
    if (agent.supportedTaskTypes && agent.supportedTaskTypes.includes(task.type)) {
      score += 20;
    }
    
    // Bonus for tool compatibility
    if (task.requiredTools && agent.supportedTools) {
      const commonTools = task.requiredTools.filter(tool => 
        agent.supportedTools.includes(tool)
      );
      score += commonTools.length * 5;
    }
    
    // Penalty for high load
    if (agent.currentLoad > 80) {
      score -= 30;
    }
    
    // Bonus for good performance history
    if (agent.metrics && agent.metrics.successRate > 0.9) {
      score += 10;
    }
    
    return Math.max(0, score);
  }

  getToolsForTaskType(taskType) {
    const toolsByType = {
      'analysis': ['analyzer', 'data_processor'],
      'generation': ['generator', 'formatter'],
      'validation': ['validator', 'checker'],
      'execution': ['executor', 'runner'],
      'general': ['general']
    };
    
    const toolNames = toolsByType[taskType] || ['general'];
    return toolNames
      .map(name => this.toolRegistry.get(name))
      .filter(tool => tool && tool.enabled !== false);
  }

  calculateConfidence(task, selectedAgent, selectedTools) {
    if (!selectedAgent) return 0;
    
    let confidence = 70; // Base confidence
    
    // Agent-task compatibility
    if (selectedAgent.type === task.requiredAgent) {
      confidence += 20;
    }
    
    // Tool availability
    const requiredTools = task.requiredTools || [];
    const availableTools = selectedTools.map(t => t.name);
    const toolCoverage = requiredTools.length > 0 ? 
      requiredTools.filter(tool => availableTools.includes(tool)).length / requiredTools.length : 1;
    confidence += toolCoverage * 10;
    
    // Agent performance history
    if (selectedAgent.metrics && selectedAgent.metrics.successRate > 0) {
      confidence += selectedAgent.metrics.successRate * 20;
    }
    
    return Math.min(100, Math.max(0, confidence));
  }

  generateReasoning(task, selectedAgent, selectedTools) {
    if (!selectedAgent) {
      return "No suitable agent found for this task";
    }
    
    const reasons = [];
    
    if (selectedAgent.type === task.requiredAgent) {
      reasons.push("matches required agent type");
    }
    
    if (selectedTools.length > 0) {
      reasons.push(`has ${selectedTools.length} compatible tools`);
    }
    
    if (selectedAgent.metrics && selectedAgent.metrics.successRate > 0.8) {
      reasons.push("has good performance history");
    }
    
    return reasons.length > 0 ? 
      `Selected because it ${reasons.join(', ')}` : 
      "Selected as best available option";
  }

  getFallbackOptions(task) {
    const fallbacks = [];
    
    // Get all compatible agents except the primary choice
    const compatibleAgents = Array.from(this.agentRegistry.values())
      .filter(agent => agent.enabled !== false)
      .map(agent => ({
        agent,
        score: this.scoreAgentForTask(agent, task)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(1, 4); // Top 3 alternatives
    
    for (const { agent, score } of compatibleAgents) {
      fallbacks.push({
        agentId: agent.id,
        agentType: agent.type,
        confidence: Math.round(score),
        reason: "Alternative option"
      });
    }
    
    return fallbacks;
  }

  updateRegistries(availableAgents, availableTools) {
    // Update agent registry
    this.agentRegistry.clear();
    for (const agent of availableAgents) {
      this.agentRegistry.set(agent.id, agent);
    }
    
    // Update tool registry
    this.toolRegistry.clear();
    for (const tool of availableTools) {
      this.toolRegistry.set(tool.name, tool);
    }
    
    console.log(`📋 [RouterAgent] Updated registries: ${availableAgents.length} agents, ${availableTools.length} tools`);
  }

  initializeDefaultRules() {
    // Default routing rules: task type -> preferred agent type
    this.routingRules.set('analysis', 'analyzer');
    this.routingRules.set('generation', 'generator');
    this.routingRules.set('validation', 'validator');
    this.routingRules.set('execution', 'executor');
    this.routingRules.set('general', 'executor');
  }

  validateInput(input) {
    const { tasks, availableAgents, availableTools } = input;
    
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return false;
    }
    
    if (!availableAgents || !Array.isArray(availableAgents)) {
      return false;
    }
    
    return true;
  }
}

module.exports = RouterAgent;
