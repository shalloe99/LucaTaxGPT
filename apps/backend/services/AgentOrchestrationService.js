const { sessionStore } = require('../models/AgentEngine');
const PlannerAgent = require('./agents/PlannerAgent');
const RouterAgent = require('./agents/RouterAgent');
const ExecutorAgent = require('./agents/ExecutorAgent');
const ValidatorAgent = require('./agents/ValidatorAgent');
const RequestSupervisor = require('./RequestSupervisor');
const { EventEmitter } = require('events');

/**
 * Agent Orchestration Engine - Conducts agent-to-agent communication
 * and manages the overall execution workflow
 */
class AgentOrchestrationService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentSessions: config.maxConcurrentSessions || 10,
      defaultTimeout: config.defaultTimeout || 300000, // 5 minutes
      enableValidation: config.enableValidation !== false,
      enableApproval: config.enableApproval !== false,
      ...config
    };
    
    // Initialize agents
    this.agents = {
      planner: new PlannerAgent(config.plannerConfig),
      router: new RouterAgent(config.routerConfig),
      executor: new ExecutorAgent(config.executorConfig),
      validator: new ValidatorAgent(config.validatorConfig)
    };
    
    // Available tools registry
    this.tools = new Map();
    this.initializeDefaultTools();
    
    // Session management
    this.activeSessions = new Map();
    
    // Request supervision
    this.supervisor = new RequestSupervisor();
    this.setupSupervisorEvents();
    
    console.log('🎭 [AgentOrchestration] Service initialized');
  }

  /**
   * Setup supervisor event listeners
   */
  setupSupervisorEvents() {
    this.supervisor.on('request:started', (data) => {
      console.log(`🚀 [Supervisor] Request started: ${data.requestId}`);
    });

    this.supervisor.on('request:phase', (data) => {
      console.log(`🔄 [Supervisor] Phase: ${data.phase} for ${data.requestId}`);
    });

    this.supervisor.on('request:thinking', (data) => {
      console.log(`💭 [Supervisor] Thinking: ${data.thought.substring(0, 100)}...`);
    });

    this.supervisor.on('request:step', (data) => {
      console.log(`⚡ [Supervisor] Step: ${data.step.name} (${data.status})`);
    });

    this.supervisor.on('request:error', (data) => {
      console.error(`❌ [Supervisor] Error in ${data.requestId}: ${data.error}`);
    });

    this.supervisor.on('request:completed', (data) => {
      console.log(`✅ [Supervisor] Request completed: ${data.requestId} (${data.finalStatus})`);
    });
  }

  /**
   * Main entry point - orchestrate agents to handle user request
   */
  async orchestrate(userRequest, userId, options = {}) {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`🎬 [AgentOrchestration] Starting orchestration for user: ${userId}`);
      console.log(`📝 [AgentOrchestration] Request: "${userRequest.substring(0, 100)}..."`);

      // Start request supervision
      this.supervisor.startSupervision(requestId, userRequest, userId);
      this.supervisor.addThinking(requestId, 'Starting orchestration process...', { userRequest });

      // Check session limits
      if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
        this.supervisor.addError(requestId, new Error('Maximum concurrent sessions reached'), { activeSessions: this.activeSessions.size });
        throw new Error('Maximum concurrent sessions reached. Please try again later.');
      }

      // Create new session
      const session = sessionStore.createSession(userId, userRequest);
      this.activeSessions.set(session.id, session);
      
      this.supervisor.addThinking(requestId, 'Created new session for request processing', { sessionId: session.id });
      this.emit('session:created', { sessionId: session.id, userId, userRequest });

      try {
        // Phase 1: Planning
        await this.executePlanningPhase(session, userRequest, options);
        
        // Phase 2: Routing
        await this.executeRoutingPhase(session);
        
        // Phase 3: Execution
        await this.executeExecutionPhase(session);
        
        // Phase 4: Validation (if enabled)
        if (this.config.enableValidation) {
          await this.executeValidationPhase(session);
        }
        
        // Phase 5: Preview and Approval (if enabled)
        if (this.config.enableApproval) {
          await this.executeApprovalPhase(session);
          
          // If approval is required, return session for user review
          if (session.approvalRequired && session.approvalStatus === 'pending') {
            session.updateStatus('awaiting_approval');
            
            return {
              success: true,
              sessionId: session.id,
              status: 'awaiting_approval',
              requiresApproval: true,
              preview: session.preview,
              executionTime: Date.now() - startTime
            };
          }
        }
        
        // Phase 6: Final Execution (if approved or no approval needed)
        if (!session.approvalRequired || session.approvalStatus === 'approved') {
          await this.executeFinalPhase(session);
        }
        
        session.updateStatus('completed');
        const totalTime = Date.now() - startTime;
        
        // Complete supervision
        this.supervisor.completeSupervision(requestId, this.compileResults(session), 'completed');
        
        console.log(`✅ [AgentOrchestration] Orchestration completed in ${totalTime}ms`);
        
        this.emit('session:completed', { sessionId: session.id, totalTime });
        
        return {
          success: true,
          sessionId: session.id,
          requestId: requestId,
          status: 'completed',
          results: this.compileResults(session),
          executionTime: totalTime,
          metadata: session.metadata,
          supervision: this.supervisor.getRequestStatus(requestId)
        };

      } finally {
        // Clean up active session
        this.activeSessions.delete(session.id);
      }

      } catch (error) {
        console.error(`❌ [AgentOrchestration] Orchestration failed:`, error);
        
        // Complete supervision with error
        this.supervisor.completeSupervision(requestId, {}, 'failed');
        
        this.emit('session:error', { userId, error: error.message });
        
        return {
          success: false,
          requestId: requestId,
          error: error.message,
          executionTime: Date.now() - startTime,
          supervision: this.supervisor.getRequestStatus(requestId)
        };
      }
    }

    /**
     * Get request ID for a session (helper method)
     */
    getRequestIdForSession(sessionId) {
      // Find the request ID associated with this session
      for (const [requestId, supervision] of this.supervisor.activeRequests) {
        if (supervision.sessionId === sessionId) {
          return requestId;
        }
      }
      return null;
    }

  /**
   * Approve a pending session
   */
  async approveSession(sessionId, userId) {
    try {
      const session = sessionStore.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session');
      }
      
      if (session.approvalStatus !== 'pending') {
        throw new Error('Session is not pending approval');
      }
      
      session.approve();
      
      // Continue with final execution
      await this.executeFinalPhase(session);
      session.updateStatus('completed');
      
      console.log(`✅ [AgentOrchestration] Session ${sessionId} approved and completed`);
      
      this.emit('session:approved', { sessionId });
      
      return {
        success: true,
        sessionId,
        status: 'completed',
        results: this.compileResults(session)
      };
      
    } catch (error) {
      console.error(`❌ [AgentOrchestration] Approval failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reject a pending session
   */
  async rejectSession(sessionId, userId, reason = '') {
    try {
      const session = sessionStore.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session');
      }
      
      session.reject(reason);
      session.updateStatus('rejected');
      
      console.log(`🚫 [AgentOrchestration] Session ${sessionId} rejected: ${reason}`);
      
      this.emit('session:rejected', { sessionId, reason });
      
      return {
        success: true,
        sessionId,
        status: 'rejected',
        reason
      };
      
    } catch (error) {
      console.error(`❌ [AgentOrchestration] Rejection failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executePlanningPhase(session, userRequest, options) {
    const requestId = this.getRequestIdForSession(session.id);
    
    this.supervisor.updatePhase(requestId, 'planning', { sessionId: session.id });
    this.supervisor.addThinking(requestId, 'Analyzing user request and breaking it down into structured tasks...');
    
    console.log(`🧠 [AgentOrchestration] Phase 1: Planning`);
    session.updatePhase('planning');
    
    const stepId = this.supervisor.addStep(requestId, 'Planning Phase', 'running', {
      userRequest: userRequest.substring(0, 100) + '...',
      sessionId: session.id
    });
    
    try {
      const plannerInput = {
        userRequest,
        userId: session.userId,
        sessionId: session.id
      };
      
      const context = {
        availableAgents: this.getAvailableAgents(),
        availableTools: Array.from(this.tools.values()),
        ...options.context
      };
      
      this.supervisor.addThinking(requestId, 'Preparing planning context with available agents and tools', {
        agentsCount: context.availableAgents.length,
        toolsCount: context.availableTools.length
      });
      
      this.supervisor.recordAgentUsage(requestId, 'planner', this.agents.planner.id, 'execute', {
        input: plannerInput,
        context: { agents: context.availableAgents.length, tools: context.availableTools.length }
      });
      
      this.supervisor.recordLLMCall(requestId, this.agents.planner.config.model, 'task_planning', {
        userRequest: userRequest.substring(0, 100) + '...'
      });
      
      const plannerResult = await this.agents.planner.execute(plannerInput, context);
      
      this.supervisor.addThinking(requestId, 'Planning completed, analyzing generated tasks...', {
        taskCount: plannerResult.executionPlan?.tasks?.length || 0,
        success: plannerResult.success
      });
      
      if (!plannerResult.success) {
        this.supervisor.addError(requestId, new Error(`Planning failed: ${plannerResult.error}`), {
          plannerResult,
          phase: 'planning'
        });
        throw new Error(`Planning failed: ${plannerResult.error}`);
      }
      
      session.setExecutionPlan(plannerResult.executionPlan);
      session.addAgent(this.agents.planner);
      
      this.supervisor.completeStep(requestId, stepId, {
        taskCount: plannerResult.executionPlan.tasks.length,
        tasks: plannerResult.executionPlan.tasks.map(t => ({
          id: t.id,
          type: t.type,
          description: t.description.substring(0, 50) + '...'
        }))
      });
      
      this.supervisor.recordDecision(requestId, 'Planning strategy selected', 
        `Generated ${plannerResult.executionPlan.tasks.length} tasks for execution`, {
        taskTypes: [...new Set(plannerResult.executionPlan.tasks.map(t => t.type))],
        complexity: plannerResult.metadata?.complexity || 'unknown'
      });
      
      console.log(`✅ [AgentOrchestration] Planning completed: ${plannerResult.executionPlan.tasks.length} tasks`);
      
    } catch (error) {
      this.supervisor.completeStep(requestId, stepId, {}, error);
      this.supervisor.addError(requestId, error, { phase: 'planning' });
      throw error;
    }
  }

  async executeRoutingPhase(session) {
    console.log(`🧭 [AgentOrchestration] Phase 2: Routing`);
    session.updatePhase('routing');
    
    const routerInput = {
      tasks: session.executionPlan.tasks,
      availableAgents: this.getAvailableAgents(),
      availableTools: Array.from(this.tools.values())
    };
    
    const routerResult = await this.agents.router.execute(routerInput, {});
    
    if (!routerResult.success) {
      throw new Error(`Routing failed: ${routerResult.error}`);
    }
    
    // Store routing information in session
    session.metadata.routings = routerResult.routings;
    session.addAgent(this.agents.router);
    
    console.log(`✅ [AgentOrchestration] Routing completed: ${routerResult.routings.length} routings`);
  }

  async executeExecutionPhase(session) {
    console.log(`⚡ [AgentOrchestration] Phase 3: Execution`);
    session.updatePhase('execution');
    
    const routings = session.metadata.routings || [];
    const results = [];
    
    // Execute tasks based on dependencies
    const readyTasks = session.executionPlan.getReadyTasks();
    
    for (const task of readyTasks) {
      const routing = routings.find(r => r.taskId === task.id);
      
      if (!routing || !routing.selectedAgent) {
        console.warn(`⚠️ [AgentOrchestration] No routing found for task ${task.id}`);
        session.updateTaskStatus(task.id, 'failed', null, 'No routing found');
        continue;
      }
      
      try {
        console.log(`🔧 [AgentOrchestration] Executing task: ${task.description.substring(0, 50)}...`);
        
        session.updateTaskStatus(task.id, 'running');
        
        const executorInput = {
          task,
          tools: routing.selectedTools || [],
          sessionId: session.id
        };
        
        const executorResult = await this.agents.executor.execute(executorInput, {
          originalRequest: session.originalRequest,
          session
        });
        
        if (executorResult.success) {
          session.updateTaskStatus(task.id, 'completed', executorResult.result);
          results.push({
            taskId: task.id,
            result: executorResult.result
          });
        } else {
          session.updateTaskStatus(task.id, 'failed', null, executorResult.error);
        }
        
      } catch (error) {
        console.error(`❌ [AgentOrchestration] Task execution failed:`, error);
        session.updateTaskStatus(task.id, 'failed', null, error.message);
      }
    }
    
    session.metadata.executionResults = results;
    session.addAgent(this.agents.executor);
    
    console.log(`✅ [AgentOrchestration] Execution completed: ${results.length} results`);
  }

  async executeValidationPhase(session) {
    console.log(`🔍 [AgentOrchestration] Phase 4: Validation`);
    session.updatePhase('validation');
    
    const executionResults = session.metadata.executionResults || [];
    const validationResults = [];
    
    for (const { taskId, result } of executionResults) {
      const task = session.executionPlan.tasks.find(t => t.id === taskId);
      
      if (!task || !result) continue;
      
      try {
        const validatorInput = {
          task,
          result,
          originalRequest: session.originalRequest,
          sessionId: session.id
        };
        
        const validatorResult = await this.agents.validator.execute(validatorInput, {
          previousResults: validationResults
        });
        
        if (validatorResult.success) {
          validationResults.push({
            taskId,
            validation: validatorResult.validation
          });
        }
        
      } catch (error) {
        console.error(`❌ [AgentOrchestration] Validation failed for task ${taskId}:`, error);
      }
    }
    
    session.metadata.validationResults = validationResults;
    session.addAgent(this.agents.validator);
    
    // Check if any validations failed critically
    const criticalFailures = validationResults.filter(v => 
      !v.validation.isValid && v.validation.confidence < 50
    );
    
    if (criticalFailures.length > 0) {
      console.warn(`⚠️ [AgentOrchestration] ${criticalFailures.length} critical validation failures`);
    }
    
    console.log(`✅ [AgentOrchestration] Validation completed: ${validationResults.length} validations`);
  }

  async executeApprovalPhase(session) {
    console.log(`👀 [AgentOrchestration] Phase 5: Preview & Approval`);
    session.updatePhase('approval');
    
    // Generate preview of what will be executed
    const preview = this.generatePreview(session);
    
    // Determine if approval is required based on risk assessment
    const requiresApproval = this.assessApprovalRequirement(session, preview);
    
    if (requiresApproval) {
      session.requireApproval(preview);
      console.log(`⏸️ [AgentOrchestration] Session requires user approval`);
    } else {
      session.approve();
      console.log(`✅ [AgentOrchestration] Session auto-approved`);
    }
  }

  async executeFinalPhase(session) {
    console.log(`🏁 [AgentOrchestration] Phase 6: Final Execution`);
    session.updatePhase('final');
    
    // Execute any final steps or tool calls that were approved
    // This is where actual changes would be made to systems
    
    console.log(`✅ [AgentOrchestration] Final execution completed`);
  }

  generatePreview(session) {
    const executionResults = session.metadata.executionResults || [];
    const validationResults = session.metadata.validationResults || [];
    
    return {
      summary: `Will execute ${executionResults.length} tasks`,
      tasks: session.executionPlan.tasks.map(task => ({
        id: task.id,
        description: task.description,
        status: task.status,
        type: task.type
      })),
      results: executionResults.map(r => ({
        taskId: r.taskId,
        type: r.result.type,
        summary: r.result.summary || 'No summary available'
      })),
      validations: validationResults.map(v => ({
        taskId: v.taskId,
        isValid: v.validation.isValid,
        confidence: v.validation.confidence,
        issues: v.validation.issues.slice(0, 3) // Top 3 issues
      })),
      riskLevel: this.assessRiskLevel(session),
      estimatedImpact: 'Medium'
    };
  }

  assessApprovalRequirement(session, preview) {
    // Simple approval requirement logic
    const riskLevel = preview.riskLevel;
    const failedValidations = preview.validations.filter(v => !v.isValid);
    
    // Require approval for high risk or validation failures
    return riskLevel === 'high' || failedValidations.length > 0;
  }

  assessRiskLevel(session) {
    const executionResults = session.metadata.executionResults || [];
    const validationResults = session.metadata.validationResults || [];
    
    // Simple risk assessment
    const hasFailedValidations = validationResults.some(v => !v.validation.isValid);
    const hasExecutionTasks = executionResults.some(r => r.result.type === 'execution');
    
    if (hasFailedValidations) return 'high';
    if (hasExecutionTasks) return 'medium';
    return 'low';
  }

  compileResults(session) {
    const executionResults = session.metadata.executionResults || [];
    const validationResults = session.metadata.validationResults || [];
    
    return {
      summary: `Completed ${executionResults.length} tasks`,
      tasks: session.executionPlan.tasks,
      results: executionResults,
      validations: validationResults,
      progress: session.getProgress(),
      metadata: session.metadata
    };
  }

  getAvailableAgents() {
    return Object.values(this.agents).map(agent => ({
      id: agent.id,
      type: agent.type,
      status: agent.status,
      metrics: agent.metrics,
      supportedTaskTypes: agent.supportedTaskTypes,
      supportedTools: agent.supportedTools,
      enabled: true
    }));
  }

  initializeDefaultTools() {
    // Import tool classes
    const AnalyzerTool = require('./tools/AnalyzerTool');
    const GeneratorTool = require('./tools/GeneratorTool');
    
    // Create tool instances
    const tools = [
      new AnalyzerTool(),
      new GeneratorTool(),
      // Add basic general tool
      {
        name: 'general',
        description: 'General purpose tool for basic operations',
        category: 'utility',
        enabled: true,
        execute: async (params, context) => ({
          success: true,
          result: 'General tool executed',
          params
        })
      }
    ];
    
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
    
    console.log(`🔧 [AgentOrchestration] Initialized ${tools.length} tools`);
  }

  // Session management methods
  getSession(sessionId) {
    return sessionStore.getSession(sessionId);
  }

  getUserSessions(userId) {
    return sessionStore.getSessionsByUser(userId);
  }

  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  // Health check
  getHealthStatus() {
    const agentStatuses = Object.entries(this.agents).map(([name, agent]) => ({
      name,
      type: agent.type,
      status: agent.status,
      metrics: agent.metrics
    }));
    
    return {
      status: 'healthy',
      activeSessions: this.activeSessions.size,
      maxSessions: this.config.maxConcurrentSessions,
      agents: agentStatuses,
      tools: Array.from(this.tools.keys()),
      totalSessions: sessionStore.sessions.size
    };
  }
}

module.exports = AgentOrchestrationService;
