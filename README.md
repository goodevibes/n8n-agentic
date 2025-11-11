# n8n-agentic

**n8n with AI coding agent integration.** This fork adds a chat sidebar and "Fix with vibe8n" button to help you build and debug workflows.

![n8n.io - Screenshot](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-screenshot-readme.png)

## What's This?

Two UI additions to n8n:
1. **"vibe8n" button** - Opens AI agent chat sidebar
2. **"Fix with vibe8n"** - Auto-debug button in error dialogs

The agent can list workflows, execute them, help debug errors, and answer questions about n8n.

## Quick Start

### 1. Install and Build

```bash
git clone https://github.com/guillaumegay13/n8n-agentic.git
cd n8n-agentic
pnpm install
pnpm build > build.log 2>&1
```

### 2. Choose Your Agent Backend

**Option A: Use Hosted vibe8n API (easiest)**

```bash
export VITE_MCP_AGENT_API_URL='https://api.vibe8n.com'
pnpm --filter n8n-editor-ui serve
```

Open http://localhost:5678, click "vibe8n" button, sign up for an API key.

**Option B: Run Example Agent (Self-Hosted)**

```bash
# In examples/ directory
cd examples
pip install -r requirements.txt

# Configure (create .env with your settings)
export ANTHROPIC_API_KEY=sk-ant-...
export MCP_SERVER_COMMAND=npx
export MCP_SERVER_ARGS=n8n-mcp
export MCP_SERVER_ENV_N8N_API_URL=http://localhost:5678
export MCP_SERVER_ENV_N8N_API_KEY=your-key

# Start simple agent
python simple_agent.py

# In another terminal, start n8n frontend
export VITE_MCP_AGENT_API_URL='http://localhost:8000'
pnpm --filter n8n-editor-ui serve
```

See `examples/README.md` for details on the reference implementation.

**Option C: Build Your Own Agent**

See "Building Your Own Agent" section below for API contract details.

### 3. Test It

1. Click the **"vibe8n"** button (lower-right corner)
2. Send a message: `List my workflows`
3. The agent responds with your n8n workflows

## Authentication

The vibe8n panel uses smart authentication that adapts based on the API URL:

**Cloud (vibe8n.io):**
- Authentication is **always required** (cannot be bypassed for security)
- Users sign up with email to receive an API key
- Keys are stored in browser localStorage and sent via `Authorization: Bearer` header

**Self-hosted (localhost, custom domains):**
- Authentication is **optional** - disabled by default for easy local development
- No signup required - works immediately out-of-the-box
- Set `VITE_MCP_AGENT_REQUIRE_AUTH=true` to enable email signup for your self-hosted instance

**Example - Enable auth for self-hosted:**
```bash
export VITE_MCP_AGENT_API_URL='https://my-agent.example.com'
export VITE_MCP_AGENT_REQUIRE_AUTH=true
pnpm --filter n8n-editor-ui serve
```

## Switching Between Hosted and Local

Just change the environment variable before starting the frontend:

```bash
# Use hosted API
export VITE_MCP_AGENT_API_URL='https://api.vibe8n.com'

# OR use local agent
export VITE_MCP_AGENT_API_URL='http://localhost:8000'

# Then start frontend
pnpm --filter n8n-editor-ui serve
```

**Pro Tip:** Create shell aliases:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias n8n-hosted='export VITE_MCP_AGENT_API_URL="https://api.vibe8n.com" && pnpm --filter n8n-editor-ui serve'
alias n8n-local='export VITE_MCP_AGENT_API_URL="http://localhost:8000" && pnpm --filter n8n-editor-ui serve'
```

## Building Your Own Agent

The vibe8n panel is **agent-agnostic** - it works with any backend that implements the `/chat` API contract.

### Quick Start: Use the Example Agent

We provide a minimal reference implementation in `examples/simple_agent.py`:
- ~400 lines of Python
- Connects to any MCP server (n8n-mcp, filesystem, GitHub, etc.)
- No auth, no billing, no database - pure protocol demo
- Perfect starting point for customization

See `examples/README.md` for setup instructions.

### Building From Scratch

Want to build a custom agent? You need an HTTP API with one endpoint:

### Required: POST /chat

**Request:**
```json
{
  "prompt": "User's message",
  "session_id": "optional-session-id"
}
```

**Response:**
```json
{
  "session_id": "session-id",
  "events": [
    {
      "type": "assistant_message",
      "content": "Your response here",
      "metadata": {}
    }
  ],
  "final": "Your response here"
}
```

### Event Types

- `assistant_message` - Final response (required)
- `tool_call` - When calling a tool (e.g., "list_workflows")
- `tool_result` - Tool execution result
- `thought` - Agent's reasoning steps
- `system_notice` - Status updates

## UI Components

The integration adds these files to n8n:

- **Sidebar:** `packages/frontend/editor-ui/src/components/McpAgent/`
  - `McpAgentSidebar.vue` - Chat interface
  - `McpAgentFloatingButton.vue` - "vibe8n" button
- **Store:** `packages/frontend/editor-ui/src/stores/mcpAgent.store.ts`
- **Error Button:** `packages/frontend/editor-ui/src/components/Error/NodeErrorView.vue`

**Environment Variables:**
- `VITE_MCP_AGENT_API_URL` - Agent API endpoint (defaults to `http://localhost:8000`)
- `VITE_MCP_AGENT_REQUIRE_AUTH` - Enable authentication for self-hosted setups (defaults to `false` for localhost, always `true` for vibe8n.io)
- `VITE_MCP_AGENT_API_TOKEN` - Optional static auth token for simple token-based auth

## Features

### Agent Sidebar
- Natural language workflow operations
- Real-time "thinking timeline" (tool calls, reasoning steps)
- Session persistence across requests
- User authentication with API keys

### Fix with vibe8n Button
- Appears in error dialogs when nodes fail
- Automatically includes:
  - Workflow/execution IDs
  - Node config and error details
  - Stack traces and input data
- Opens sidebar with pre-filled diagnostic prompt

### Event Streaming (Optional)
If your agent implements `GET /sessions/:id/events` (Server-Sent Events), the UI shows real-time updates as the agent thinks and works.

## Troubleshooting

**Button doesn't appear:**
- Set `VITE_MCP_AGENT_API_URL` before starting frontend
- Restart dev server: `Ctrl+C` then `pnpm --filter n8n-editor-ui serve`

**CORS errors:**
Add CORS middleware to your agent (see example above)

**Local agent won't start:**
```bash
# Check database is running
docker-compose ps

# Check Python dependencies
pip install -r requirements.txt

# Check n8n is accessible
curl http://localhost:5678/healthz
```

**Connection refused:**
- Verify agent is running: `curl http://localhost:8000/health`
- Check the URL matches: `echo $VITE_MCP_AGENT_API_URL`

## Development

### Making UI Changes

Edit files in `packages/frontend/editor-ui/src/components/McpAgent/` - changes hot-reload automatically.

### Adding Event Types

1. Edit `mcpAgent.store.ts`:
```typescript
type McpAgentEventType = 'assistant_message' | 'tool_call' | 'your_new_type';
```

2. Update `summariseEvent()` function to handle the new type

3. Emit from your agent backend

### Testing

```bash
# Frontend tests
cd packages/frontend/editor-ui
pnpm test

# Lint and typecheck
pnpm lint && pnpm typecheck
```

## Deployment

Build for production:

```bash
export VITE_MCP_AGENT_API_URL='https://api.vibe8n.com'
pnpm build
```

Deploy `packages/frontend/editor-ui/dist/` to your hosting platform.

## License

Inherits n8n's [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md).

The vibe8n Agent API is a separate service.

## Support

- **UI Issues:** https://github.com/guillaumegay13/n8n-agentic/issues
- **vibe8n API:** guillaume.gay@protonmail.com

---

**Quick Commands Reference:**

```bash
# Use hosted vibe8n API
export VITE_MCP_AGENT_API_URL='https://api.vibe8n.com'
pnpm --filter n8n-editor-ui serve

# Use your custom agent
export VITE_MCP_AGENT_API_URL='http://localhost:8000'
pnpm --filter n8n-editor-ui serve

# Test custom agent API
curl http://localhost:8000/health
curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"prompt":"Hello"}'
```
