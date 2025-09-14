const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Request Supervisor - Monitors and tracks the thinking process of each request
 * Provides real-time status updates and debugging information
 */
class RequestSupervisor extends EventEmitter {
  constructor() {
    super();
    this.activeRequests = new Map();
    this.requestHistory = new Map();
    this.debugLogs = new Map();
    this.statusFile = path.join(__dirname, '../storage/request-status.json');
    this.ensureStorageDirectory();
    this.loadPersistedStatus();
  }

  /**
   * Start supervising a new request
   */
  startSupervision(requestId, userRequest, userId) {
    const supervision = {
      requestId,
      userRequest,
      userId,
      startTime: Date.now(),
      currentPhase: 'initializing',
      status: 'active',
      phases: [],
      steps: [],
      errors: [],
      warnings: [],
      metrics: {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        retries: 0
      },
      thinking: {
        currentThought: 'Initializing request...',
        thoughtHistory: [],
        decisions: [],
        reasoning: []
      },
      resources: {
        agentsUsed: [],
        toolsUsed: [],
        llmCalls: 0,
        apiCalls: 0
      },
      lastUpdate: Date.now()
    };

    this.activeRequests.set(requestId, supervision);
    this.saveStatus();
    
    this.log(requestId, 'supervisor', 'Request supervision started', {
      userRequest: userRequest.substring(0, 100) + '...',
      userId
    });

    this.emit('request:started', { requestId, userRequest, userId });
    return supervision;
  }

  /**
   * Update the current phase of a request
   */
  updatePhase(requestId, phase, details = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const phaseInfo = {
      phase,
      startTime: Date.now(),
      details,
      status: 'running'
    };

    supervision.currentPhase = phase;
    supervision.phases.push(phaseInfo);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'phase', `Entered phase: ${phase}`, details);
    this.emit('request:phase', { requestId, phase, details });
    this.saveStatus();
  }

  /**
   * Add a thinking step to the process
   */
  addThinking(requestId, thought, context = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const thinkingStep = {
      timestamp: Date.now(),
      thought,
      context,
      phase: supervision.currentPhase
    };

    supervision.thinking.currentThought = thought;
    supervision.thinking.thoughtHistory.push(thinkingStep);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'thinking', thought, context);
    this.emit('request:thinking', { requestId, thought, context });
    this.saveStatus();
  }

  /**
   * Record a decision made during processing
   */
  recordDecision(requestId, decision, reasoning, context = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const decisionRecord = {
      timestamp: Date.now(),
      decision,
      reasoning,
      context,
      phase: supervision.currentPhase
    };

    supervision.thinking.decisions.push(decisionRecord);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'decision', decision, { reasoning, ...context });
    this.emit('request:decision', { requestId, decision, reasoning, context });
    this.saveStatus();
  }

  /**
   * Add a processing step
   */
  addStep(requestId, stepName, status = 'running', details = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const step = {
      id: `${requestId}_${Date.now()}`,
      name: stepName,
      status,
      startTime: Date.now(),
      endTime: null,
      details,
      phase: supervision.currentPhase,
      duration: null
    };

    supervision.steps.push(step);
    supervision.metrics.totalSteps++;
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'step', `Step started: ${stepName}`, details);
    this.emit('request:step', { requestId, step, status });
    this.saveStatus();

    return step.id;
  }

  /**
   * Complete a processing step
   */
  completeStep(requestId, stepId, result = {}, error = null) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const step = supervision.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = error ? 'failed' : 'completed';
    step.endTime = Date.now();
    step.duration = step.endTime - step.startTime;
    step.result = result;
    step.error = error;

    if (error) {
      supervision.metrics.failedSteps++;
      supervision.errors.push({
        stepId,
        stepName: step.name,
        error: error.message,
        timestamp: Date.now(),
        phase: supervision.currentPhase
      });
    } else {
      supervision.metrics.completedSteps++;
    }

    supervision.lastUpdate = Date.now();

    this.log(requestId, 'step', `Step completed: ${step.name}`, { 
      status: step.status, 
      duration: step.duration,
      error: error?.message 
    });
    this.emit('request:stepComplete', { requestId, step, result, error });
    this.saveStatus();
  }

  /**
   * Record agent usage
   */
  recordAgentUsage(requestId, agentType, agentId, action, details = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const usage = {
      timestamp: Date.now(),
      agentType,
      agentId,
      action,
      details,
      phase: supervision.currentPhase
    };

    supervision.resources.agentsUsed.push(usage);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'agent', `${agentType} ${action}`, details);
    this.emit('request:agent', { requestId, agentType, agentId, action, details });
    this.saveStatus();
  }

  /**
   * Record tool usage
   */
  recordToolUsage(requestId, toolName, action, details = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const usage = {
      timestamp: Date.now(),
      toolName,
      action,
      details,
      phase: supervision.currentPhase
    };

    supervision.resources.toolsUsed.push(usage);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'tool', `${toolName} ${action}`, details);
    this.emit('request:tool', { requestId, toolName, action, details });
    this.saveStatus();
  }

  /**
   * Record LLM call
   */
  recordLLMCall(requestId, model, purpose, details = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    supervision.resources.llmCalls++;
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'llm', `LLM call: ${model} - ${purpose}`, details);
    this.emit('request:llm', { requestId, model, purpose, details });
    this.saveStatus();
  }

  /**
   * Add warning
   */
  addWarning(requestId, warning, context = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const warningRecord = {
      timestamp: Date.now(),
      warning,
      context,
      phase: supervision.currentPhase
    };

    supervision.warnings.push(warningRecord);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'warning', warning, context);
    this.emit('request:warning', { requestId, warning, context });
    this.saveStatus();
  }

  /**
   * Add error
   */
  addError(requestId, error, context = {}) {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    const errorRecord = {
      timestamp: Date.now(),
      error: error.message || error,
      stack: error.stack,
      context,
      phase: supervision.currentPhase
    };

    supervision.errors.push(errorRecord);
    supervision.lastUpdate = Date.now();

    this.log(requestId, 'error', error.message || error, context);
    this.emit('request:error', { requestId, error: error.message || error, context });
    this.saveStatus();
  }

  /**
   * Complete request supervision
   */
  completeSupervision(requestId, result = {}, finalStatus = 'completed') {
    const supervision = this.activeRequests.get(requestId);
    if (!supervision) return;

    supervision.status = finalStatus;
    supervision.endTime = Date.now();
    supervision.totalDuration = supervision.endTime - supervision.startTime;
    supervision.finalResult = result;
    supervision.lastUpdate = Date.now();

    // Move to history
    this.requestHistory.set(requestId, supervision);
    this.activeRequests.delete(requestId);

    this.log(requestId, 'supervisor', `Request ${finalStatus}`, {
      duration: supervision.totalDuration,
      totalSteps: supervision.metrics.totalSteps,
      completedSteps: supervision.metrics.completedSteps,
      failedSteps: supervision.metrics.failedSteps
    });

    this.emit('request:completed', { requestId, result, finalStatus, supervision });
    this.saveStatus();

    // Cleanup after 1 hour
    setTimeout(() => {
      this.requestHistory.delete(requestId);
      this.saveStatus();
    }, 60 * 60 * 1000);
  }

  /**
   * Get current status of a request
   */
  getRequestStatus(requestId) {
    const supervision = this.activeRequests.get(requestId) || this.requestHistory.get(requestId);
    if (!supervision) return null;

    return {
      requestId: supervision.requestId,
      userRequest: supervision.userRequest,
      userId: supervision.userId,
      status: supervision.status,
      currentPhase: supervision.currentPhase,
      currentThought: supervision.thinking.currentThought,
      progress: {
        phases: supervision.phases.length,
        steps: supervision.metrics.completedSteps,
        totalSteps: supervision.metrics.totalSteps,
        percentage: supervision.metrics.totalSteps > 0 ? 
          Math.round((supervision.metrics.completedSteps / supervision.metrics.totalSteps) * 100) : 0
      },
      duration: supervision.endTime ? 
        supervision.totalDuration : 
        Date.now() - supervision.startTime,
      resources: {
        agentsUsed: supervision.resources.agentsUsed.length,
        toolsUsed: supervision.resources.toolsUsed.length,
        llmCalls: supervision.resources.llmCalls,
        apiCalls: supervision.resources.apiCalls
      },
      issues: {
        errors: supervision.errors.length,
        warnings: supervision.warnings.length
      },
      lastUpdate: supervision.lastUpdate,
      recentSteps: supervision.steps.slice(-5),
      recentThoughts: supervision.thinking.thoughtHistory.slice(-3)
    };
  }

  /**
   * Get all active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values()).map(supervision => 
      this.getRequestStatus(supervision.requestId)
    );
  }

  /**
   * Get detailed thinking process for a request
   */
  getThinkingProcess(requestId) {
    const supervision = this.activeRequests.get(requestId) || this.requestHistory.get(requestId);
    if (!supervision) return null;

    return {
      currentThought: supervision.thinking.currentThought,
      thoughtHistory: supervision.thinking.thoughtHistory,
      decisions: supervision.thinking.decisions,
      reasoning: supervision.thinking.reasoning
    };
  }

  /**
   * Get debug logs for a request
   */
  getDebugLogs(requestId, limit = 50) {
    const logs = this.debugLogs.get(requestId) || [];
    return logs.slice(-limit);
  }

  /**
   * Internal logging method
   */
  log(requestId, type, message, data = {}) {
    const logEntry = {
      timestamp: Date.now(),
      type,
      message,
      data,
      requestId
    };

    if (!this.debugLogs.has(requestId)) {
      this.debugLogs.set(requestId, []);
    }

    this.debugLogs.get(requestId).push(logEntry);

    // Keep only last 100 logs per request
    const logs = this.debugLogs.get(requestId);
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }

    // Console output for debugging
    const timestamp = new Date().toISOString().substring(11, 23);
    console.log(`[${timestamp}] [${requestId.substring(0, 8)}] [${type.toUpperCase()}] ${message}`);
  }

  /**
   * Save status to file
   */
  saveStatus() {
    try {
      const statusData = {
        activeRequests: Array.from(this.activeRequests.entries()),
        requestHistory: Array.from(this.requestHistory.entries()),
        lastSaved: Date.now()
      };

      fs.writeFileSync(this.statusFile, JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.error('❌ Failed to save request status:', error);
    }
  }

  /**
   * Load persisted status
   */
  loadPersistedStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = fs.readFileSync(this.statusFile, 'utf8');
        const statusData = JSON.parse(data);
        
        // Only load recent requests (within last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        if (statusData.activeRequests) {
          for (const [requestId, supervision] of statusData.activeRequests) {
            if (supervision.startTime > oneHourAgo) {
              this.activeRequests.set(requestId, supervision);
            }
          }
        }

        if (statusData.requestHistory) {
          for (const [requestId, supervision] of statusData.requestHistory) {
            if (supervision.startTime > oneHourAgo) {
              this.requestHistory.set(requestId, supervision);
            }
          }
        }

        console.log(`📊 [RequestSupervisor] Loaded ${this.activeRequests.size} active requests, ${this.requestHistory.size} completed requests`);
      }
    } catch (error) {
      console.error('❌ Failed to load request status:', error);
    }
  }

  /**
   * Ensure storage directory exists
   */
  ensureStorageDirectory() {
    const storageDir = path.dirname(this.statusFile);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
  }

  /**
   * Get supervisor health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      activeRequests: this.activeRequests.size,
      completedRequests: this.requestHistory.size,
      totalLogs: Array.from(this.debugLogs.values()).reduce((sum, logs) => sum + logs.length, 0),
      uptime: process.uptime(),
      lastSaved: fs.existsSync(this.statusFile) ? fs.statSync(this.statusFile).mtime : null
    };
  }
}

module.exports = RequestSupervisor;
