# Agent Orchestration Engine

A comprehensive agent-to-agent communication system that orchestrates multiple AI agents to handle complex user requests through structured workflows.

## Overview

The Agent Orchestration Engine implements a multi-agent system where specialized agents collaborate to break down, route, execute, and validate user requests. The system provides a shared interface and protocol for agent communication, with built-in state management, versioning, and approval workflows.

## Architecture

### Core Components

1. **Engine (Orchestration Service)** - The conductor that manages agent coordination, state, and versioning
2. **Agents** - Specialized AI-powered or tool-powered components that follow a common interface
3. **Tools** - Execution utilities that agents can use to perform specific tasks
4. **Session Management** - Persistent state tracking and workflow coordination

### Agent Types

#### 1. Planner Agent (`PlannerAgent.js`)
- **Purpose**: Breaks down user requests into structured, actionable tasks
- **LLM-Backed**: Uses GPT models to analyze requests and create execution plans
- **Output**: Structured execution plan with tasks, dependencies, and priorities

#### 2. Router Agent (`RouterAgent.js`)
- **Purpose**: Selects the right executor agents and tools for each task
- **Logic-Based**: Uses routing rules and scoring algorithms
- **Output**: Agent and tool assignments for each task

#### 3. Executor Agent (`ExecutorAgent.js`)
- **Purpose**: Executes tasks using assigned tools or LLM capabilities
- **Hybrid**: Can use both tools and LLM for task execution
- **Output**: Task results and generated content

#### 4. Validator Agent (`ValidatorAgent.js`)
- **Purpose**: Performs sanity checks and validation on outputs
- **LLM-Backed**: Uses AI for semantic validation plus rule-based checks
- **Output**: Validation results with confidence scores and recommendations

## Workflow

```
1. User Request → Planner Agent
   ↓
2. Execution Plan → Router Agent
   ↓
3. Task Routing → Executor Agent(s)
   ↓
4. Task Results → Validator Agent
   ↓
5. Validation → Engine (Preview Generation)
   ↓
6. User Approval → Final Execution
```

## API Endpoints

### Main Orchestration
- `POST /api/agents/orchestrate` - Submit a request for agent processing
- `GET /api/agents/sessions/:id` - Get session details
- `GET /api/agents/sessions` - List user sessions

### Approval Workflow
- `POST /api/agents/sessions/:id/approve` - Approve pending session
- `POST /api/agents/sessions/:id/reject` - Reject pending session
- `GET /api/agents/sessions/:id/preview` - Get execution preview

### Management
- `GET /api/agents/health` - System health check
- `POST /api/agents/sessions/:id/cancel` - Cancel running session
- `GET /api/agents/sessions/:id/history` - Get execution history

## Usage Examples

### Basic Request
```javascript
const response = await fetch('/api/agents/orchestrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    request: "Analyze our website performance and suggest improvements"
  })
});
```

### With Context
```javascript
const response = await fetch('/api/agents/orchestrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    request: "Generate a project plan for the new feature",
    options: {
      context: {
        deadline: "2024-03-01",
        team_size: 5,
        budget: "$50000"
      }
    }
  })
});
```

### Approval Workflow
```javascript
// If session requires approval
if (result.requiresApproval) {
  // Get preview
  const preview = await fetch(`/api/agents/sessions/${result.sessionId}/preview`);
  
  // Approve or reject
  await fetch(`/api/agents/sessions/${result.sessionId}/approve`, {
    method: 'POST'
  });
}
```

## Available Tools

### AnalyzerTool
- **Purpose**: Analyzes data, content, or systems
- **Types**: content, data, system, performance, general
- **Features**: Pattern detection, anomaly identification, insights generation

### GeneratorTool
- **Purpose**: Creates content, code, or structured outputs
- **Types**: text, code, documentation, email, report, summary, plan
- **Features**: Template-based generation, LLM enhancement, format conversion

## Configuration

### Environment Variables
```bash
# OpenAI Configuration (for LLM agents)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL_NAME=gpt-4o-mini

# AI Configuration
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=2000

# Agent Engine Configuration
AGENT_MAX_CONCURRENT_SESSIONS=10
AGENT_ENABLE_VALIDATION=true
AGENT_ENABLE_APPROVAL=true
```

### Service Configuration
```javascript
const orchestrationService = new AgentOrchestrationService({
  maxConcurrentSessions: 10,
  enableValidation: true,
  enableApproval: true,
  plannerConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.3,
    maxTasks: 20
  },
  executorConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.7,
    maxRetries: 3
  },
  validatorConfig: {
    model: 'gpt-4o-mini',
    modelType: 'chatgpt',
    temperature: 0.2,
    strictMode: false
  }
});
```

## Session States

- **active** - Session is currently being processed
- **awaiting_approval** - Session requires user approval before proceeding
- **completed** - Session has been successfully completed
- **rejected** - Session was rejected by user
- **cancelled** - Session was cancelled
- **failed** - Session failed due to errors

## Execution Phases

1. **planning** - Breaking down the request into tasks
2. **routing** - Selecting agents and tools for tasks
3. **execution** - Executing tasks with assigned resources
4. **validation** - Validating results and checking quality
5. **approval** - Generating preview and waiting for approval
6. **final** - Executing final steps and completing session

## Error Handling

The system includes comprehensive error handling:
- Agent-level error recovery with retries
- Session-level error tracking and reporting
- Graceful degradation when services are unavailable
- Detailed error messages for debugging

## Testing

Run the test script to verify the system:
```bash
node examples/agent-test.js
```

This will test:
- Basic orchestration workflow
- Agent communication
- Tool execution
- Approval workflow
- Health monitoring

## Storage

Sessions and execution history are stored in:
- `storage/agent-sessions.json` - Session data
- In-memory state for active sessions
- Automatic cleanup of old sessions

## Monitoring

The system provides built-in monitoring:
- Agent performance metrics
- Session success rates
- Tool usage statistics
- System health indicators

## Security

- User isolation (sessions are user-scoped)
- Input validation and sanitization
- Rate limiting through Express middleware
- Approval workflow for high-risk operations

## Extensibility

The system is designed for easy extension:
- Add new agent types by extending `BaseAgent`
- Create new tools by extending `Tool`
- Customize routing rules in `RouterAgent`
- Add validation rules in `ValidatorAgent`

## Performance

- Concurrent session processing
- Tool result caching
- Efficient memory management
- Background cleanup processes

## Future Enhancements

- Real-time WebSocket updates
- Advanced tool marketplace
- Multi-user collaboration
- Enhanced security features
- Performance optimizations
- Custom agent development SDK
