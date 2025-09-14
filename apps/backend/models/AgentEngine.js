const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Agent Engine Models and Interfaces

/**
 * Base Agent Interface
 * All agents must implement this interface
 */
class BaseAgent {
  constructor(id, type, config = {}) {
    this.id = id;
    this.type = type;
    this.config = config;
    this.status = 'idle';
    this.lastExecution = null;
    this.metrics = {
      totalExecutions: 0,
      successRate: 0,
      avgExecutionTime: 0
    };
  }

  /**
   * Execute agent logic
   * @param {Object} input - Input data for the agent
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Agent output
   */
  async execute(input, context) {
    throw new Error('Execute method must be implemented by subclass');
  }

  /**
   * Validate input before execution
   * @param {Object} input - Input to validate
   * @returns {boolean} Whether input is valid
   */
  validateInput(input) {
    return true;
  }

  /**
   * Update agent metrics
   * @param {boolean} success - Whether execution was successful
   * @param {number} executionTime - Time taken in ms
   */
  updateMetrics(success, executionTime) {
    this.metrics.totalExecutions++;
    this.metrics.avgExecutionTime = 
      (this.metrics.avgExecutionTime + executionTime) / 2;
    
    const successCount = Math.floor(this.metrics.successRate * this.metrics.totalExecutions);
    this.metrics.successRate = 
      (successCount + (success ? 1 : 0)) / this.metrics.totalExecutions;
  }
}

/**
 * Task representation for agent processing
 */
class Task {
  constructor(description, type, priority = 'medium', dependencies = []) {
    this.id = uuidv4();
    this.description = description;
    this.type = type;
    this.priority = priority;
    this.dependencies = dependencies;
    this.status = 'pending';
    this.assignedAgent = null;
    this.result = null;
    this.error = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.executionTime = null;
  }

  updateStatus(status, result = null, error = null) {
    this.status = status;
    this.result = result;
    this.error = error;
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Execution Plan containing structured tasks
 */
class ExecutionPlan {
  constructor(originalRequest, userId) {
    this.id = uuidv4();
    this.originalRequest = originalRequest;
    this.userId = userId;
    this.tasks = [];
    this.status = 'draft';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.estimatedDuration = null;
    this.actualDuration = null;
    this.metadata = {};
  }

  addTask(task) {
    this.tasks.push(task);
    this.updatedAt = new Date().toISOString();
  }

  updateStatus(status) {
    this.status = status;
    this.updatedAt = new Date().toISOString();
  }

  getTasksByStatus(status) {
    return this.tasks.filter(task => task.status === status);
  }

  getReadyTasks() {
    return this.tasks.filter(task => {
      if (task.status !== 'pending') return false;
      
      // Check if all dependencies are completed
      return task.dependencies.every(depId => {
        const depTask = this.tasks.find(t => t.id === depId);
        return depTask && depTask.status === 'completed';
      });
    });
  }
}

/**
 * Agent execution session with state management
 */
class AgentSession {
  constructor(sessionId, userId, originalRequest) {
    this.id = sessionId || uuidv4();
    this.userId = userId;
    this.originalRequest = originalRequest;
    this.executionPlan = null;
    this.currentPhase = 'planning';
    this.status = 'active';
    this.agents = new Map();
    this.executionHistory = [];
    this.approvalRequired = false;
    this.approvalStatus = 'pending';
    this.preview = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.version = '1.0.0';
    this.metadata = {
      totalAgents: 0,
      completedTasks: 0,
      failedTasks: 0,
      estimatedCompletion: null
    };
  }

  updatePhase(phase) {
    this.currentPhase = phase;
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'phase_change',
      phase,
      timestamp: new Date().toISOString()
    });
  }

  updateStatus(status) {
    this.status = status;
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'status_change',
      status,
      timestamp: new Date().toISOString()
    });
  }

  addAgent(agent) {
    this.agents.set(agent.id, agent);
    this.metadata.totalAgents = this.agents.size;
    this.updatedAt = new Date().toISOString();
  }

  addToHistory(entry) {
    this.executionHistory.push(entry);
    // Keep only last 100 entries
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }
  }

  setExecutionPlan(plan) {
    this.executionPlan = plan;
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'plan_created',
      taskCount: plan.tasks.length,
      timestamp: new Date().toISOString()
    });
  }

  requireApproval(preview) {
    this.approvalRequired = true;
    this.approvalStatus = 'pending';
    this.preview = preview;
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'approval_requested',
      timestamp: new Date().toISOString()
    });
  }

  approve() {
    this.approvalStatus = 'approved';
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'approved',
      timestamp: new Date().toISOString()
    });
  }

  reject(reason = '') {
    this.approvalStatus = 'rejected';
    this.metadata.rejectionReason = reason;
    this.updatedAt = new Date().toISOString();
    this.addToHistory({
      type: 'rejected',
      reason,
      timestamp: new Date().toISOString()
    });
  }

  updateTaskStatus(taskId, status, result = null, error = null) {
    if (this.executionPlan) {
      const task = this.executionPlan.tasks.find(t => t.id === taskId);
      if (task) {
        task.updateStatus(status, result, error);
        
        if (status === 'completed') {
          this.metadata.completedTasks++;
        } else if (status === 'failed') {
          this.metadata.failedTasks++;
        }
        
        this.updatedAt = new Date().toISOString();
        this.addToHistory({
          type: 'task_updated',
          taskId,
          status,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  getProgress() {
    if (!this.executionPlan) return { completed: 0, total: 0, percentage: 0 };
    
    const total = this.executionPlan.tasks.length;
    const completed = this.executionPlan.getTasksByStatus('completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      originalRequest: this.originalRequest,
      executionPlan: this.executionPlan,
      currentPhase: this.currentPhase,
      status: this.status,
      agents: Array.from(this.agents.values()),
      executionHistory: this.executionHistory.slice(-20), // Last 20 entries
      approvalRequired: this.approvalRequired,
      approvalStatus: this.approvalStatus,
      preview: this.preview,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
      metadata: this.metadata,
      progress: this.getProgress()
    };
  }
}

/**
 * Tool interface for executor agents
 */
class Tool {
  constructor(name, description, parameters = {}, category = 'general') {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.category = category;
    this.version = '1.0.0';
    this.enabled = true;
    this.usageCount = 0;
    this.lastUsed = null;
  }

  /**
   * Execute the tool with given parameters
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Tool result
   */
  async execute(params, context) {
    throw new Error('Execute method must be implemented by subclass');
  }

  /**
   * Validate tool parameters
   * @param {Object} params - Parameters to validate
   * @returns {boolean} Whether parameters are valid
   */
  validateParams(params) {
    // Basic validation - can be overridden
    return true;
  }

  updateUsage() {
    this.usageCount++;
    this.lastUsed = new Date().toISOString();
  }
}

/**
 * In-memory storage for agent sessions
 */
class AgentSessionStore {
  constructor() {
    this.sessions = new Map();
    this.storageFile = path.join(__dirname, '../storage/agent-sessions.json');
    this.loadFromFile();
  }

  createSession(userId, originalRequest) {
    const session = new AgentSession(null, userId, originalRequest);
    this.sessions.set(session.id, session);
    this.saveToFile();
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.updatedAt = new Date().toISOString();
      this.saveToFile();
      return session;
    }
    return null;
  }

  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.saveToFile();
    }
    return deleted;
  }

  getSessionsByUser(userId) {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'active');
  }

  loadFromFile() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const sessionsData = JSON.parse(data);
        
        for (const sessionData of sessionsData) {
          const session = Object.assign(new AgentSession(), sessionData);
          // Restore execution plan if exists
          if (session.executionPlan) {
            session.executionPlan = Object.assign(new ExecutionPlan(), session.executionPlan);
            session.executionPlan.tasks = session.executionPlan.tasks.map(taskData => 
              Object.assign(new Task(), taskData)
            );
          }
          this.sessions.set(session.id, session);
        }
        
        console.log(`✅ Loaded ${this.sessions.size} agent sessions from storage`);
      }
    } catch (error) {
      console.error('❌ Error loading agent sessions:', error);
    }
  }

  saveToFile() {
    try {
      // Ensure storage directory exists
      const storageDir = path.dirname(this.storageFile);
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      
      const sessionsData = Array.from(this.sessions.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(sessionsData, null, 2));
    } catch (error) {
      console.error('❌ Error saving agent sessions:', error);
    }
  }

  cleanup() {
    // Remove sessions older than 24 hours that are completed/failed
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions) {
      const sessionDate = new Date(session.updatedAt);
      if (sessionDate < cutoff && ['completed', 'failed', 'cancelled'].includes(session.status)) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.saveToFile();
      console.log(`🧹 Cleaned up ${cleaned} old agent sessions`);
    }
  }
}

// Global session store instance
const sessionStore = new AgentSessionStore();

// Cleanup old sessions every hour
setInterval(() => {
  sessionStore.cleanup();
}, 60 * 60 * 1000);

module.exports = {
  BaseAgent,
  Task,
  ExecutionPlan,
  AgentSession,
  Tool,
  AgentSessionStore,
  sessionStore
};
