# Simple vibe8n Agent - Example Implementation

This is a **minimal reference implementation** showing how to build an agent compatible with the vibe8n panel integrated into n8n.

## What This Shows

- ✅ How to connect to MCP servers (n8n-mcp, etc.)
- ✅ The `/chat` API contract for vibe8n panel
- ✅ Structured event responses (`AgentResponsePayload` format)
- ✅ Basic agentic loop with tool calling
- ✅ No authentication, no billing, no database

## Quick Start

### 1. Install Dependencies

```bash
cd examples/
pip install -r requirements.txt
```

### 2. Configure Environment

Create `.env`:

```bash
# MCP Server (n8n-mcp example)
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=n8n-mcp
MCP_SERVER_ENV_N8N_API_URL=http://localhost:5678
MCP_SERVER_ENV_N8N_API_KEY=your-n8n-api-key

# LLM Provider
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Optional
PORT=8000
```

### 3. Run the Agent

```bash
python simple_agent.py
```

The agent starts at `http://localhost:8000`

### 4. Connect n8n Frontend

In the main n8n-agentic directory:

```bash
export VITE_MCP_AGENT_API_URL=http://localhost:8000
pnpm --filter n8n-editor-ui serve
```

Open n8n at `http://localhost:5678`, click the **vibe8n** button (lower-right), and start chatting!

## API Contract

### Request: `POST /chat`

```json
{
  "prompt": "List my workflows",
  "session_id": "uuid-v4-string"
}
```

### Response: `ChatResponse`

```json
{
  "events": [
    {
      "type": "thought",
      "content": "Analyzing request...",
      "metadata": null
    },
    {
      "type": "tool_call",
      "content": "list_workflows",
      "metadata": {
        "arguments": {}
      }
    },
    {
      "type": "tool_result",
      "content": "[{\"id\":\"1\",\"name\":\"My Workflow\"}]",
      "metadata": {
        "tool": "list_workflows"
      }
    },
    {
      "type": "assistant_message",
      "content": "You have 1 workflow called 'My Workflow'."
    }
  ],
  "final": "You have 1 workflow called 'My Workflow'.",
  "session_id": "uuid-v4-string"
}
```

### Event Types

- **`thought`**: Internal reasoning (shown in "Show thinking" timeline)
- **`tool_call`**: Agent is invoking a tool
- **`tool_result`**: Tool execution result
- **`assistant_message`**: Final response to user
- **`system_notice`**: System-level notification

## Limitations

This is a **demonstration** agent. For production use, you need:

- ❌ No authentication / API keys
- ❌ No rate limiting
- ❌ No conversation history (stateless)
- ❌ No streaming events (SSE)
- ❌ No error recovery
- ❌ No session management
- ❌ No approval system
- ❌ No usage tracking

For a **production-ready agent** with all these features, see:
- [vibe8n.io](https://vibe8n.io) - Hosted service (recommended)
- [vibe8n-agent](https://github.com/yourusername/vibe8n-agent) - Self-host with auth/Stripe

## Using Other MCP Servers

This agent works with **any stdio-compatible MCP server**:

```bash
# Example: Filesystem MCP
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=-y @modelcontextprotocol/server-filesystem /path/to/files

# Example: GitHub MCP
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=-y @modelcontextprotocol/server-github
MCP_SERVER_ENV_GITHUB_TOKEN=ghp_...
```

## Using OpenAI Instead of Anthropic

Replace the `run_agent()` function to use OpenAI SDK. The protocol remains the same.

## License

MIT - Use this as a starting point for your own agents!
