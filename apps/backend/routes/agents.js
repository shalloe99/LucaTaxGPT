const express = require('express');
const router = express.Router();
const AgentOrchestrationService = require('../services/AgentOrchestrationService');
const { sessionStore } = require('../models/AgentEngine');

// For demo purposes, hardcode userId
const DEMO_USER_ID = "demo-user";

// Initialize orchestration service
const orchestrationService = new AgentOrchestrationService({
  maxConcurrentSessions: 10,
  enableValidation: true,
  enableApproval: true,
  plannerConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.3
  },
  executorConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.7
  },
  validatorConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.2,
    strictMode: false
  }
});

// Event logging
orchestrationService.on('session:created', (data) => {
  console.log(`📝 [AgentAPI] Session created: ${data.sessionId}`);
});

orchestrationService.on('session:completed', (data) => {
  console.log(`✅ [AgentAPI] Session completed: ${data.sessionId} in ${data.totalTime}ms`);
});

orchestrationService.on('session:error', (data) => {
  console.error(`❌ [AgentAPI] Session error for user ${data.userId}: ${data.error}`);
});

/**
 * Main orchestration endpoint
 * POST /api/agents/orchestrate
 */
router.post('/orchestrate', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { request, options = {} } = req.body;
    
    console.log(`🎭 [AgentAPI] Orchestration request: "${request?.substring(0, 100)}..."`);
    
    // Validate request
    if (!request || typeof request !== 'string' || request.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request is required and must be a non-empty string'
      });
    }
    
    if (request.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Request is too long (maximum 5000 characters)'
      });
    }
    
    // Execute orchestration
    const result = await orchestrationService.orchestrate(request, DEMO_USER_ID, options);
    
    const totalTime = Date.now() - startTime;
    
    res.json({
      ...result,
      totalExecutionTime: totalTime
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Orchestration endpoint error:', error);
    
    const totalTime = Date.now() - startTime;
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during orchestration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      totalExecutionTime: totalTime
    });
  }
});

/**
 * Approve a pending session
 * POST /api/agents/sessions/:sessionId/approve
 */
router.post('/sessions/:sessionId/approve', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`👍 [AgentAPI] Approving session: ${sessionId}`);
    
    const result = await orchestrationService.approveSession(sessionId, DEMO_USER_ID);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ [AgentAPI] Approval error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to approve session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Reject a pending session
 * POST /api/agents/sessions/:sessionId/reject
 */
router.post('/sessions/:sessionId/reject', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = '' } = req.body;
    
    console.log(`👎 [AgentAPI] Rejecting session: ${sessionId}, reason: ${reason}`);
    
    const result = await orchestrationService.rejectSession(sessionId, DEMO_USER_ID, reason);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ [AgentAPI] Rejection error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to reject session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get session details
 * GET /api/agents/sessions/:sessionId
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = orchestrationService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.userId !== DEMO_USER_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      session: session.toJSON()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get session error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List user sessions
 * GET /api/agents/sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    let sessions = orchestrationService.getUserSessions(DEMO_USER_ID);
    
    // Filter by status if specified
    if (status) {
      sessions = sessions.filter(session => session.status === status);
    }
    
    // Apply pagination
    const total = sessions.length;
    const paginatedSessions = sessions
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
      .map(session => ({
        id: session.id,
        originalRequest: session.originalRequest.substring(0, 100) + '...',
        status: session.status,
        currentPhase: session.currentPhase,
        approvalRequired: session.approvalRequired,
        approvalStatus: session.approvalStatus,
        progress: session.getProgress(),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));
    
    res.json({
      success: true,
      sessions: paginatedSessions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] List sessions error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sessions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get orchestration service health
 * GET /api/agents/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = orchestrationService.getHealthStatus();
    const supervisorHealth = orchestrationService.supervisor.getHealthStatus();
    
    res.json({
      success: true,
      health: {
        ...health,
        supervisor: supervisorHealth
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Health check error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get request status and thinking process
 * GET /api/agents/requests/:requestId/status
 */
router.get('/requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const status = orchestrationService.supervisor.getRequestStatus(requestId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get request status error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get request status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get thinking process for a request
 * GET /api/agents/requests/:requestId/thinking
 */
router.get('/requests/:requestId/thinking', async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const thinking = orchestrationService.supervisor.getThinkingProcess(requestId);
    
    if (!thinking) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    res.json({
      success: true,
      thinking,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get thinking process error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get thinking process',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get debug logs for a request
 * GET /api/agents/requests/:requestId/logs
 */
router.get('/requests/:requestId/logs', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { limit = 50 } = req.query;
    
    const logs = orchestrationService.supervisor.getDebugLogs(requestId, parseInt(limit));
    
    res.json({
      success: true,
      logs,
      count: logs.length,
      requestId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get debug logs error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get debug logs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get all active requests
 * GET /api/agents/requests/active
 */
router.get('/requests/active', async (req, res) => {
  try {
    const activeRequests = orchestrationService.supervisor.getActiveRequests();
    
    res.json({
      success: true,
      requests: activeRequests,
      count: activeRequests.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get active requests error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get active requests',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Cancel a running session
 * POST /api/agents/sessions/:sessionId/cancel
 */
router.post('/sessions/:sessionId/cancel', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = orchestrationService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.userId !== DEMO_USER_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    if (!['active', 'awaiting_approval'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        error: 'Session cannot be cancelled in current state',
        currentStatus: session.status
      });
    }
    
    session.updateStatus('cancelled');
    
    console.log(`🛑 [AgentAPI] Session cancelled: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      status: 'cancelled'
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Cancel session error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get execution preview for a session
 * GET /api/agents/sessions/:sessionId/preview
 */
router.get('/sessions/:sessionId/preview', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = orchestrationService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.userId !== DEMO_USER_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      preview: session.preview,
      approvalRequired: session.approvalRequired,
      approvalStatus: session.approvalStatus
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get preview error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve preview',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get session execution history
 * GET /api/agents/sessions/:sessionId/history
 */
router.get('/sessions/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = orchestrationService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.userId !== DEMO_USER_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      history: session.executionHistory,
      totalEvents: session.executionHistory.length
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Get history error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Test endpoint for quick validation
 * POST /api/agents/test
 */
router.post('/test', async (req, res) => {
  try {
    const { request = "Analyze the current system status" } = req.body;
    
    console.log(`🧪 [AgentAPI] Test request: ${request}`);
    
    const result = await orchestrationService.orchestrate(request, DEMO_USER_ID, {
      context: { testMode: true }
    });
    
    res.json({
      success: true,
      test: true,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [AgentAPI] Test error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Error handling middleware for agent routes
router.use((err, req, res, next) => {
  console.error('❌ [AgentAPI] Route error:', err);
  
  res.status(500).json({
    success: false,
    error: 'Agent orchestration error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
