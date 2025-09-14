#!/usr/bin/env node

const readline = require('readline');
const axios = require('axios');

/**
 * Interactive Console UI for testing Agent Orchestration Engine
 */
class AgentTestConsole {
  constructor() {
    this.baseUrl = 'http://localhost:5300';
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.currentSession = null;
    this.sessionHistory = [];
  }

  async start() {
    console.log('🎭 Agent Orchestration Engine - Interactive Test Console');
    console.log('=' .repeat(60));
    console.log('Commands:');
    console.log('  test <request>     - Test orchestration with a request');
    console.log('  monitor <id>       - Monitor session/request in real-time');
    console.log('  status <requestId> - Get detailed request status and thinking');
    console.log('  thinking <requestId> - Get thinking process for a request');
    console.log('  logs <requestId>   - Get debug logs for a request');
    console.log('  active            - List all active requests');
    console.log('  health            - Check system health');
    console.log('  sessions          - List all sessions');
    console.log('  session <id>      - Get session details');
    console.log('  approve <id>      - Approve a session');
    console.log('  reject <id> <reason> - Reject a session');
    console.log('  preview <id>      - Get session preview');
    console.log('  history <id>      - Get session history');
    console.log('  examples          - Show example requests');
    console.log('  help              - Show this help');
    console.log('  quit              - Exit console');
    console.log('=' .repeat(60));
    
    this.prompt();
  }

  prompt() {
    this.rl.question('\n🎭 Agent> ', async (input) => {
      await this.handleCommand(input.trim());
    });
  }

  async handleCommand(input) {
    const [command, ...args] = input.split(' ');

    try {
      switch (command.toLowerCase()) {
        case 'test':
          await this.testOrchestration(args.join(' '));
          break;
        case 'monitor':
          // Check if it's a request ID (starts with req_) or session ID
          if (args[0] && args[0].startsWith('req_')) {
            await this.monitorRequest(args[0]);
          } else {
            await this.monitorSession(args[0]);
          }
          break;
        case 'status':
          await this.getRequestStatus(args[0]);
          break;
        case 'thinking':
          await this.getThinkingProcess(args[0]);
          break;
        case 'logs':
          await this.getDebugLogs(args[0]);
          break;
        case 'active':
          await this.getActiveRequests();
          break;
        case 'health':
          await this.checkHealth();
          break;
        case 'sessions':
          await this.listSessions();
          break;
        case 'session':
          await this.getSession(args[0]);
          break;
        case 'approve':
          await this.approveSession(args[0]);
          break;
        case 'reject':
          await this.rejectSession(args[0], args.slice(1).join(' '));
          break;
        case 'preview':
          await this.getPreview(args[0]);
          break;
        case 'history':
          await this.getHistory(args[0]);
          break;
        case 'examples':
          this.showExamples();
          break;
        case 'help':
          this.showHelp();
          break;
        case 'quit':
        case 'exit':
          console.log('👋 Goodbye!');
          this.rl.close();
          return;
        case '':
          // Empty input, just prompt again
          break;
        default:
          console.log(`❌ Unknown command: ${command}`);
          console.log('Type "help" for available commands');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }

    this.prompt();
  }

  async testOrchestration(request) {
    if (!request) {
      console.log('❌ Please provide a request. Example: test "Analyze our website performance"');
      return;
    }

    console.log(`🚀 Testing orchestration with request: "${request}"`);
    console.log('⏳ Processing...');

    try {
      // Set up timeout and progress tracking
      const timeout = 120000; // 2 minutes timeout
      const startTime = Date.now();
      let requestId = null;

      // Create a promise that resolves with the response
      const orchestrationPromise = axios.post(`${this.baseUrl}/api/agents/orchestrate`, {
        request,
        options: {
          context: {
            testMode: true,
            timestamp: new Date().toISOString()
          }
        }
      }, {
        timeout: timeout
      });

      // Set up detailed progress monitoring
      const progressInterval = setInterval(async () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        
        // Try to get request status if we have a requestId
        if (requestId) {
          try {
            const statusResponse = await axios.get(`${this.baseUrl}/api/agents/requests/${requestId}/status`);
            const status = statusResponse.data.status;
            
            console.log(`\n📊 [${elapsed}s] Status Update:`);
            console.log(`   🔄 Phase: ${status.currentPhase}`);
            console.log(`   💭 Thinking: ${status.currentThought}`);
            console.log(`   📈 Progress: ${status.progress.percentage}% (${status.progress.steps}/${status.progress.totalSteps} steps)`);
            console.log(`   🔧 Resources: ${status.resources.agentsUsed} agents, ${status.resources.toolsUsed} tools, ${status.resources.llmCalls} LLM calls`);
            
            if (status.issues.errors > 0) {
              console.log(`   ❌ Errors: ${status.issues.errors}`);
            }
            if (status.issues.warnings > 0) {
              console.log(`   ⚠️  Warnings: ${status.issues.warnings}`);
            }
            
            // Show recent steps
            if (status.recentSteps && status.recentSteps.length > 0) {
              console.log(`   ⚡ Recent Steps:`);
              status.recentSteps.slice(-3).forEach((step, index) => {
                const statusIcon = step.status === 'completed' ? '✅' : step.status === 'running' ? '🟡' : '❌';
                const duration = step.duration ? ` (${Math.round(step.duration)}ms)` : ' (running)';
                console.log(`      ${statusIcon} ${step.name}${duration}`);
              });
            }
            
          } catch (statusError) {
            console.log(`⏳ Still processing... (${elapsed}s elapsed) - Status check failed`);
          }
        } else {
          console.log(`⏳ Still processing... (${elapsed}s elapsed)`);
        }
      }, 5000); // Update every 5 seconds for more frequent updates

      // Wait for response with timeout
      const response = await Promise.race([
        orchestrationPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 2 minutes')), timeout)
        )
      ]);

      clearInterval(progressInterval);

      const result = response.data;
      requestId = result.requestId; // Capture requestId for future use
      
      console.log('\n📊 Orchestration Result:');
      console.log('=' .repeat(60));
      console.log(`✅ Success: ${result.success}`);
      console.log(`🆔 Session ID: ${result.sessionId || 'N/A'}`);
      console.log(`🆔 Request ID: ${result.requestId || 'N/A'}`);
      console.log(`📈 Status: ${result.status || 'N/A'}`);
      console.log(`⏱️  Execution Time: ${result.executionTime || result.totalExecutionTime || 'N/A'}ms`);
      
      if (result.requiresApproval) {
        console.log('⚠️  This session requires approval!');
        console.log('💡 Use "preview <sessionId>" to see what will be executed');
        console.log('💡 Use "approve <sessionId>" to approve execution');
        this.currentSession = result.sessionId;
      }
      
      if (result.results) {
        console.log('\n📋 Results Summary:');
        console.log(`   Tasks: ${result.results.tasks?.length || 0}`);
        console.log(`   Completed: ${result.results.progress?.completed || 0}/${result.results.progress?.total || 0}`);
        console.log(`   Progress: ${result.results.progress?.percentage || 0}%`);
      }
      
      if (result.supervision) {
        console.log('\n🧠 Thinking Process Summary:');
        console.log('=' .repeat(40));
        console.log(`💭 Current Thought: ${result.supervision.currentThought}`);
        console.log(`🔄 Phase: ${result.supervision.currentPhase}`);
        console.log(`📈 Progress: ${result.supervision.progress.percentage}% (${result.supervision.progress.steps}/${result.supervision.progress.totalSteps} steps)`);
        console.log(`⏱️  Duration: ${Math.round(result.supervision.duration / 1000)}s`);
        console.log(`🔧 Resources Used:`);
        console.log(`   - Agents: ${result.supervision.resources.agentsUsed}`);
        console.log(`   - Tools: ${result.supervision.resources.toolsUsed}`);
        console.log(`   - LLM Calls: ${result.supervision.resources.llmCalls}`);
        console.log(`   - API Calls: ${result.supervision.resources.apiCalls}`);
        
        if (result.supervision.issues.errors > 0 || result.supervision.issues.warnings > 0) {
          console.log(`⚠️  Issues:`);
          console.log(`   - Errors: ${result.supervision.issues.errors}`);
          console.log(`   - Warnings: ${result.supervision.issues.warnings}`);
        }
        
        if (result.requestId) {
          console.log(`\n💡 Debug Commands:`);
          console.log(`   status ${result.requestId}     - Detailed status and thinking`);
          console.log(`   thinking ${result.requestId}   - Full thought history`);
          console.log(`   logs ${result.requestId}       - Debug logs`);
          console.log(`   active                        - List all active requests`);
        }
      }
      
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      }

      // Store in history
      this.sessionHistory.push({
        timestamp: new Date().toISOString(),
        request,
        sessionId: result.sessionId,
        requestId: result.requestId,
        status: result.status,
        success: result.success
      });

    } catch (error) {
      console.error('❌ Request failed:', error.response?.data?.error || error.message);
      if (error.code === 'ECONNREFUSED') {
        console.log('💡 Make sure the server is running: npm run dev');
      } else if (error.message.includes('timeout')) {
        console.log('⏰ Request timed out. The orchestration might still be running.');
        console.log('💡 Try "sessions" to see if a session was created');
      }
    }
  }

  async monitorSession(sessionId) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`👀 Monitoring session: ${sessionId}`);
    console.log('Press Ctrl+C to stop monitoring\n');

    let lastStatus = null;
    let lastPhase = null;
    let lastProgress = null;

    const monitorInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${this.baseUrl}/api/agents/sessions/${sessionId}`);
        const session = response.data.session;

        const currentStatus = session.status;
        const currentPhase = session.currentPhase;
        const currentProgress = session.progress;

        // Only log if something changed
        if (currentStatus !== lastStatus || currentPhase !== lastPhase ||
            (currentProgress && lastProgress &&
             (currentProgress.completed !== lastProgress.completed ||
              currentProgress.percentage !== lastProgress.percentage))) {

          const timestamp = new Date().toLocaleTimeString();
          console.log(`[${timestamp}] Status: ${currentStatus} | Phase: ${currentPhase}`);

          if (currentProgress) {
            console.log(`[${timestamp}] Progress: ${currentProgress.completed}/${currentProgress.total} (${currentProgress.percentage}%)`);
          }

          if (session.approvalRequired && session.approvalStatus === 'pending') {
            console.log(`[${timestamp}] ⚠️  Approval required!`);
          }

          lastStatus = currentStatus;
          lastPhase = currentPhase;
          lastProgress = currentProgress;

          // Stop monitoring if session is completed, failed, or cancelled
          if (['completed', 'failed', 'cancelled', 'rejected'].includes(currentStatus)) {
            console.log(`\n✅ Session ${currentStatus}! Monitoring stopped.`);
            clearInterval(monitorInterval);
            return;
          }
        }
      } catch (error) {
        console.error(`❌ Monitoring error: ${error.response?.data?.error || error.message}`);
        clearInterval(monitorInterval);
      }
    }, 2000); // Check every 2 seconds

    // Handle Ctrl+C to stop monitoring
    process.on('SIGINT', () => {
      console.log('\n🛑 Monitoring stopped by user');
      clearInterval(monitorInterval);
      process.exit(0);
    });
  }

  async monitorRequest(requestId) {
    if (!requestId) {
      console.log('❌ Please provide a request ID');
      return;
    }

    console.log(`👀 Monitoring request: ${requestId}`);
    console.log('Press Ctrl+C to stop monitoring\n');

    let lastStatus = null;
    let lastPhase = null;
    let lastProgress = null;
    let lastThought = null;

    const monitorInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${this.baseUrl}/api/agents/requests/${requestId}/status`);
        const status = response.data.status;

        const currentStatus = status.status;
        const currentPhase = status.currentPhase;
        const currentProgress = status.progress;
        const currentThought = status.currentThought;

        // Only log if something changed
        if (currentStatus !== lastStatus || currentPhase !== lastPhase ||
            currentThought !== lastThought ||
            (currentProgress && lastProgress &&
             (currentProgress.percentage !== lastProgress.percentage))) {

          const timestamp = new Date().toLocaleTimeString();
          console.log(`\n[${timestamp}] 📊 Request Status Update:`);
          console.log(`   🔄 Status: ${currentStatus}`);
          console.log(`   🔄 Phase: ${currentPhase}`);
          console.log(`   💭 Thinking: ${currentThought}`);
          
          if (currentProgress) {
            console.log(`   📈 Progress: ${currentProgress.percentage}% (${currentProgress.steps}/${currentProgress.totalSteps} steps)`);
          }

          console.log(`   🔧 Resources: ${status.resources.agentsUsed} agents, ${status.resources.toolsUsed} tools, ${status.resources.llmCalls} LLM calls`);
          
          if (status.issues.errors > 0 || status.issues.warnings > 0) {
            console.log(`   ⚠️  Issues: ${status.issues.errors} errors, ${status.issues.warnings} warnings`);
          }

          // Show recent steps
          if (status.recentSteps && status.recentSteps.length > 0) {
            console.log(`   ⚡ Recent Steps:`);
            status.recentSteps.slice(-2).forEach((step, index) => {
              const statusIcon = step.status === 'completed' ? '✅' : step.status === 'running' ? '🟡' : '❌';
              const duration = step.duration ? ` (${Math.round(step.duration)}ms)` : ' (running)';
              console.log(`      ${statusIcon} ${step.name}${duration}`);
            });
          }

          lastStatus = currentStatus;
          lastPhase = currentPhase;
          lastProgress = currentProgress;
          lastThought = currentThought;

          // Stop monitoring if request is completed, failed, or cancelled
          if (['completed', 'failed', 'cancelled', 'rejected'].includes(currentStatus)) {
            console.log(`\n✅ Request ${currentStatus}! Monitoring stopped.`);
            clearInterval(monitorInterval);
            return;
          }
        }
      } catch (error) {
        console.error(`❌ Monitoring error: ${error.response?.data?.error || error.message}`);
        clearInterval(monitorInterval);
      }
    }, 3000); // Check every 3 seconds

    // Handle Ctrl+C to stop monitoring
    process.on('SIGINT', () => {
      console.log('\n🛑 Monitoring stopped by user');
      clearInterval(monitorInterval);
      process.exit(0);
    });
  }

  async checkHealth() {
    console.log('🏥 Checking system health...');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/health`);
      const health = response.data.health;
      
      console.log('\n📊 System Health:');
      console.log('=' .repeat(30));
      console.log(`🟢 Status: ${health.status}`);
      console.log(`📊 Active Sessions: ${health.activeSessions}/${health.maxSessions}`);
      console.log(`🔧 Total Sessions: ${health.totalSessions}`);
      console.log(`🛠️  Available Tools: ${health.tools?.length || 0}`);
      
      console.log('\n🤖 Agent Status:');
      health.agents?.forEach(agent => {
        const status = agent.status === 'idle' ? '🟢' : agent.status === 'running' ? '🟡' : '🔴';
        console.log(`   ${status} ${agent.name}: ${agent.status} (${agent.metrics?.totalExecutions || 0} executions)`);
      });
      
    } catch (error) {
      console.error('❌ Health check failed:', error.response?.data?.error || error.message);
    }
  }

  async listSessions() {
    console.log('📋 Fetching sessions...');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/sessions`);
      const sessions = response.data.sessions;
      
      if (sessions.length === 0) {
        console.log('📭 No sessions found');
        return;
      }
      
      console.log(`\n📋 Sessions (${sessions.length}):`);
      console.log('=' .repeat(80));
      console.log('ID'.padEnd(36) + 'Status'.padEnd(15) + 'Phase'.padEnd(12) + 'Progress'.padEnd(10) + 'Request');
      console.log('-'.repeat(80));
      
      sessions.forEach(session => {
        const id = session.id.substring(0, 8) + '...';
        const status = session.status;
        const phase = session.currentPhase || 'N/A';
        const progress = session.progress ? `${session.progress.percentage}%` : 'N/A';
        const request = session.originalRequest.substring(0, 30) + '...';
        
        console.log(
          id.padEnd(36) + 
          status.padEnd(15) + 
          phase.padEnd(12) + 
          progress.padEnd(10) + 
          request
        );
      });
      
    } catch (error) {
      console.error('❌ Failed to fetch sessions:', error.response?.data?.error || error.message);
    }
  }

  async getSession(sessionId) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`🔍 Fetching session: ${sessionId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/sessions/${sessionId}`);
      const session = response.data.session;
      
      console.log('\n📊 Session Details:');
      console.log('=' .repeat(40));
      console.log(`🆔 ID: ${session.id}`);
      console.log(`👤 User: ${session.userId}`);
      console.log(`📈 Status: ${session.status}`);
      console.log(`🔄 Phase: ${session.currentPhase}`);
      console.log(`⏰ Created: ${session.createdAt}`);
      console.log(`🔄 Updated: ${session.updatedAt}`);
      
      if (session.approvalRequired) {
        console.log(`⚠️  Approval Required: ${session.approvalStatus}`);
      }
      
      if (session.progress) {
        console.log(`📊 Progress: ${session.progress.completed}/${session.progress.total} (${session.progress.percentage}%)`);
      }
      
      if (session.executionPlan) {
        console.log(`📋 Tasks: ${session.executionPlan.tasks?.length || 0}`);
      }
      
      if (session.originalRequest) {
        console.log(`\n📝 Original Request:`);
        console.log(`   "${session.originalRequest}"`);
      }
      
    } catch (error) {
      console.error('❌ Failed to fetch session:', error.response?.data?.error || error.message);
    }
  }

  async approveSession(sessionId) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`👍 Approving session: ${sessionId}`);
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/agents/sessions/${sessionId}/approve`);
      const result = response.data;
      
      if (result.success) {
        console.log('✅ Session approved successfully!');
        console.log(`📈 Status: ${result.status}`);
      } else {
        console.log(`❌ Approval failed: ${result.error}`);
      }
      
    } catch (error) {
      console.error('❌ Approval failed:', error.response?.data?.error || error.message);
    }
  }

  async rejectSession(sessionId, reason) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`👎 Rejecting session: ${sessionId}`);
    if (reason) {
      console.log(`📝 Reason: ${reason}`);
    }
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/agents/sessions/${sessionId}/reject`, {
        reason: reason || 'No reason provided'
      });
      const result = response.data;
      
      if (result.success) {
        console.log('✅ Session rejected successfully!');
        console.log(`📈 Status: ${result.status}`);
      } else {
        console.log(`❌ Rejection failed: ${result.error}`);
      }
      
    } catch (error) {
      console.error('❌ Rejection failed:', error.response?.data?.error || error.message);
    }
  }

  async getPreview(sessionId) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`👀 Fetching preview for session: ${sessionId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/sessions/${sessionId}/preview`);
      const preview = response.data.preview;
      
      console.log('\n👀 Session Preview:');
      console.log('=' .repeat(40));
      console.log(`📋 Summary: ${preview.summary}`);
      console.log(`⚠️  Risk Level: ${preview.riskLevel}`);
      console.log(`📊 Estimated Impact: ${preview.estimatedImpact}`);
      
      if (preview.tasks) {
        console.log(`\n📋 Tasks (${preview.tasks.length}):`);
        preview.tasks.forEach((task, index) => {
          const status = task.status === 'completed' ? '✅' : task.status === 'running' ? '🟡' : '⏳';
          console.log(`   ${index + 1}. ${status} ${task.description.substring(0, 50)}...`);
        });
      }
      
      if (preview.results) {
        console.log(`\n📊 Results (${preview.results.length}):`);
        preview.results.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.type}: ${result.summary}`);
        });
      }
      
      if (preview.validations) {
        console.log(`\n🔍 Validations (${preview.validations.length}):`);
        preview.validations.forEach((validation, index) => {
          const status = validation.isValid ? '✅' : '❌';
          console.log(`   ${index + 1}. ${status} Confidence: ${validation.confidence}%`);
          if (validation.issues && validation.issues.length > 0) {
            validation.issues.forEach(issue => {
              console.log(`      ⚠️  ${issue}`);
            });
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to fetch preview:', error.response?.data?.error || error.message);
    }
  }

  async getHistory(sessionId) {
    if (!sessionId) {
      console.log('❌ Please provide a session ID');
      return;
    }

    console.log(`📜 Fetching history for session: ${sessionId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/sessions/${sessionId}/history`);
      const history = response.data.history;
      
      console.log(`\n📜 Session History (${history.length} events):`);
      console.log('=' .repeat(60));
      
      history.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const type = event.type || 'unknown';
        console.log(`${index + 1}. [${timestamp}] ${type}`);
        
        if (event.phase) console.log(`   Phase: ${event.phase}`);
        if (event.status) console.log(`   Status: ${event.status}`);
        if (event.taskCount) console.log(`   Tasks: ${event.taskCount}`);
        if (event.reason) console.log(`   Reason: ${event.reason}`);
      });
      
    } catch (error) {
      console.error('❌ Failed to fetch history:', error.response?.data?.error || error.message);
    }
  }

  showExamples() {
    console.log('\n💡 Example Requests:');
    console.log('=' .repeat(40));
    console.log('test "Analyze our website performance and suggest optimizations"');
    console.log('test "Generate a project plan for implementing user authentication"');
    console.log('test "Create a comprehensive report on system security vulnerabilities"');
    console.log('test "Write a professional email to stakeholders about Q4 progress"');
    console.log('test "Design a database schema for an e-commerce application"');
    console.log('test "Analyze customer feedback data and provide insights"');
    console.log('test "Generate documentation for our API endpoints"');
    console.log('test "Create a risk assessment for migrating to cloud infrastructure"');
  }

  async getRequestStatus(requestId) {
    if (!requestId) {
      console.log('❌ Please provide a request ID');
      return;
    }

    console.log(`🔍 Getting status for request: ${requestId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/requests/${requestId}/status`);
      const status = response.data.status;
      
      console.log('\n📊 Request Status:');
      console.log('=' .repeat(50));
      console.log(`🆔 Request ID: ${status.requestId}`);
      console.log(`📝 Request: ${status.userRequest.substring(0, 100)}...`);
      console.log(`👤 User: ${status.userId}`);
      console.log(`📈 Status: ${status.status}`);
      console.log(`🔄 Phase: ${status.currentPhase}`);
      console.log(`💭 Current Thought: ${status.currentThought}`);
      console.log(`⏱️  Duration: ${Math.round(status.duration / 1000)}s`);
      
      console.log('\n📊 Progress:');
      console.log(`   Phases: ${status.progress.phases}`);
      console.log(`   Steps: ${status.progress.steps}/${status.progress.totalSteps} (${status.progress.percentage}%)`);
      
      console.log('\n🔧 Resources Used:');
      console.log(`   Agents: ${status.resources.agentsUsed}`);
      console.log(`   Tools: ${status.resources.toolsUsed}`);
      console.log(`   LLM Calls: ${status.resources.llmCalls}`);
      
      if (status.issues.errors > 0 || status.issues.warnings > 0) {
        console.log('\n⚠️  Issues:');
        console.log(`   Errors: ${status.issues.errors}`);
        console.log(`   Warnings: ${status.issues.warnings}`);
      }
      
      if (status.recentSteps && status.recentSteps.length > 0) {
        console.log('\n⚡ Recent Steps:');
        status.recentSteps.forEach((step, index) => {
          const status = step.status === 'completed' ? '✅' : step.status === 'running' ? '🟡' : '❌';
          console.log(`   ${index + 1}. ${status} ${step.name} (${step.duration ? Math.round(step.duration) + 'ms' : 'running'})`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to get request status:', error.response?.data?.error || error.message);
    }
  }

  async getThinkingProcess(requestId) {
    if (!requestId) {
      console.log('❌ Please provide a request ID');
      return;
    }

    console.log(`🧠 Getting thinking process for request: ${requestId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/requests/${requestId}/thinking`);
      const thinking = response.data.thinking;
      
      console.log('\n🧠 Thinking Process:');
      console.log('=' .repeat(50));
      console.log(`💭 Current Thought: ${thinking.currentThought}`);
      
      if (thinking.thoughtHistory && thinking.thoughtHistory.length > 0) {
        console.log('\n📚 Thought History:');
        thinking.thoughtHistory.forEach((thought, index) => {
          const time = new Date(thought.timestamp).toLocaleTimeString();
          console.log(`   ${index + 1}. [${time}] ${thought.thought}`);
          if (thought.context && Object.keys(thought.context).length > 0) {
            console.log(`      Context: ${JSON.stringify(thought.context, null, 2).substring(0, 100)}...`);
          }
        });
      }
      
      if (thinking.decisions && thinking.decisions.length > 0) {
        console.log('\n🎯 Decisions Made:');
        thinking.decisions.forEach((decision, index) => {
          const time = new Date(decision.timestamp).toLocaleTimeString();
          console.log(`   ${index + 1}. [${time}] ${decision.decision}`);
          console.log(`      Reasoning: ${decision.reasoning}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to get thinking process:', error.response?.data?.error || error.message);
    }
  }

  async getDebugLogs(requestId) {
    if (!requestId) {
      console.log('❌ Please provide a request ID');
      return;
    }

    console.log(`📋 Getting debug logs for request: ${requestId}`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/requests/${requestId}/logs?limit=20`);
      const logs = response.data.logs;
      
      if (logs.length === 0) {
        console.log('📭 No debug logs found for this request');
        return;
      }
      
      console.log(`\n📋 Debug Logs (${logs.length}):`);
      console.log('=' .repeat(80));
      
      logs.forEach((log, index) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const type = log.type.toUpperCase().padEnd(8);
        console.log(`[${time}] [${type}] ${log.message}`);
        
        if (log.data && Object.keys(log.data).length > 0) {
          const dataStr = JSON.stringify(log.data, null, 2);
          if (dataStr.length > 200) {
            console.log(`         Data: ${dataStr.substring(0, 200)}...`);
          } else {
            console.log(`         Data: ${dataStr}`);
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to get debug logs:', error.response?.data?.error || error.message);
    }
  }

  async getActiveRequests() {
    console.log('📊 Fetching active requests...');
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/agents/requests/active`);
      const requests = response.data.requests;
      
      if (requests.length === 0) {
        console.log('📭 No active requests found');
        return;
      }
      
      console.log(`\n📊 Active Requests (${requests.length}):`);
      console.log('=' .repeat(100));
      console.log('Request ID'.padEnd(20) + 'Status'.padEnd(12) + 'Phase'.padEnd(12) + 'Progress'.padEnd(10) + 'Duration'.padEnd(10) + 'Request');
      console.log('-'.repeat(100));
      
      requests.forEach(req => {
        const id = req.requestId.substring(0, 8) + '...';
        const status = req.status;
        const phase = req.currentPhase;
        const progress = `${req.progress.percentage}%`;
        const duration = `${Math.round(req.duration / 1000)}s`;
        const request = req.userRequest.substring(0, 30) + '...';
        
        console.log(
          id.padEnd(20) + 
          status.padEnd(12) + 
          phase.padEnd(12) + 
          progress.padEnd(10) + 
          duration.padEnd(10) + 
          request
        );
      });
      
    } catch (error) {
      console.error('❌ Failed to get active requests:', error.response?.data?.error || error.message);
    }
  }

  showHelp() {
    console.log('\n📚 Available Commands:');
    console.log('=' .repeat(50));
    console.log('🎯 TESTING & MONITORING:');
    console.log('  test <request>     - Test orchestration with a request');
    console.log('  monitor <id>       - Monitor session/request in real-time');
    console.log('  active            - List all active requests');
    console.log('');
    console.log('🔍 DEBUGGING & ANALYSIS:');
    console.log('  status <requestId> - Get detailed request status and thinking');
    console.log('  thinking <requestId> - Get thinking process for a request');
    console.log('  logs <requestId>   - Get debug logs for a request');
    console.log('');
    console.log('📊 SESSION MANAGEMENT:');
    console.log('  sessions          - List all sessions');
    console.log('  session <id>      - Get session details');
    console.log('  approve <id>      - Approve a session');
    console.log('  reject <id> <reason> - Reject a session');
    console.log('  preview <id>      - Get session preview');
    console.log('  history <id>      - Get session history');
    console.log('');
    console.log('🛠️  SYSTEM:');
    console.log('  health            - Check system health');
    console.log('  examples          - Show example requests');
    console.log('  help              - Show this help');
    console.log('  quit              - Exit console');
    console.log('');
    console.log('💡 TIP: Use "test" to start a request, then "monitor <requestId>" for real-time tracking!');
  }
}

// Start the console if run directly
if (require.main === module) {
  const console = new AgentTestConsole();
  console.start();
}

module.exports = AgentTestConsole;
