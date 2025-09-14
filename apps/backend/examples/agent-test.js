const AgentOrchestrationService = require('../services/AgentOrchestrationService');

/**
 * Simple test script to demonstrate the Agent Orchestration Engine
 */
async function testAgentOrchestration() {
  console.log('🎭 Testing Agent Orchestration Engine...\n');
  
  // Initialize orchestration service
  const orchestrationService = new AgentOrchestrationService({
    maxConcurrentSessions: 5,
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
      temperature: 0.2
    }
  });

  try {
    // Test 1: Simple analysis request
    console.log('📊 Test 1: Analysis Request');
    console.log('Request: "Analyze the performance metrics of our web application"');
    
    const result1 = await orchestrationService.orchestrate(
      "Analyze the performance metrics of our web application and provide recommendations for optimization",
      "test-user-1",
      {
        context: {
          testMode: true
        }
      }
    );
    
    console.log('Result:', JSON.stringify(result1, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Content generation request
    console.log('✨ Test 2: Content Generation Request');
    console.log('Request: "Generate a professional email to stakeholders about project progress"');
    
    const result2 = await orchestrationService.orchestrate(
      "Generate a professional email to stakeholders about our Q4 project progress, highlighting key achievements and next steps",
      "test-user-2",
      {
        context: {
          testMode: true,
          projectContext: "Q4 Development Sprint"
        }
      }
    );
    
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Complex multi-step request
    console.log('🔧 Test 3: Complex Multi-Step Request');
    console.log('Request: "Create a comprehensive project plan for implementing a new feature"');
    
    const result3 = await orchestrationService.orchestrate(
      "Create a comprehensive project plan for implementing a new user authentication feature, including timeline, resources, and risk assessment",
      "test-user-3",
      {
        context: {
          testMode: true,
          feature: "user-authentication",
          deadline: "2024-03-01"
        }
      }
    );
    
    console.log('Result:', JSON.stringify(result3, null, 2));
    
    // If approval is required, demonstrate approval workflow
    if (result3.requiresApproval && result3.sessionId) {
      console.log('\n🔍 Approval Required - Testing Approval Workflow...');
      
      // Get session preview
      const session = orchestrationService.getSession(result3.sessionId);
      if (session && session.preview) {
        console.log('Preview:', JSON.stringify(session.preview, null, 2));
        
        // Approve the session
        console.log('\n👍 Approving session...');
        const approvalResult = await orchestrationService.approveSession(result3.sessionId, "test-user-3");
        console.log('Approval Result:', JSON.stringify(approvalResult, null, 2));
      }
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 4: Health check
    console.log('🏥 Test 4: Health Check');
    const health = orchestrationService.getHealthStatus();
    console.log('Health Status:', JSON.stringify(health, null, 2));
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Export for use as module or run directly
if (require.main === module) {
  testAgentOrchestration()
    .then(() => {
      console.log('\n🎉 Agent Orchestration Engine test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testAgentOrchestration };
