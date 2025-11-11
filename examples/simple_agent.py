#!/usr/bin/env python3
"""
Simple MCP Agent for vibe8n Panel
==================================

A minimal reference implementation showing how to build an agent
compatible with the vibe8n panel in n8n-agentic.

This agent:
- Connects to n8n-mcp server (or any MCP server)
- Provides a /chat endpoint with structured event responses
- Has NO auth, NO Stripe, NO database (pure protocol demo)
- Perfect for self-hosters who want to run their own agent

Usage:
    python simple_agent.py

Requirements:
    pip install fastapi uvicorn anthropic mcp

Configuration (via environment variables):
    MCP_SERVER_COMMAND=npx
    MCP_SERVER_ARGS=n8n-mcp
    MCP_SERVER_ENV_N8N_API_URL=http://localhost:5678
    MCP_SERVER_ENV_N8N_API_KEY=your-key

    ANTHROPIC_API_KEY=your-key
    # OR
    OPENAI_API_KEY=your-key

Then in n8n-agentic:
    export VITE_MCP_AGENT_API_URL=http://localhost:8000
    pnpm --filter n8n-editor-ui serve
"""

import os
import json
import asyncio
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mcp.client.stdio as mcp_stdio
from anthropic import Anthropic


# ============================================================================
# Request/Response Models
# ============================================================================

class ChatRequest(BaseModel):
    prompt: str
    session_id: str


class AgentEvent(BaseModel):
    type: str  # assistant_message, tool_call, tool_result, thought, system_notice
    content: Any
    metadata: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    events: List[AgentEvent]
    final: str
    session_id: str


# ============================================================================
# MCP Connection Management
# ============================================================================

mcp_client: Optional[Any] = None


async def start_mcp():
    """Initialize MCP server connection."""
    global mcp_client

    command = os.getenv("MCP_SERVER_COMMAND", "npx")
    args = os.getenv("MCP_SERVER_ARGS", "n8n-mcp").split()

    # Collect MCP server environment variables
    server_env = {}
    for key, value in os.environ.items():
        if key.startswith("MCP_SERVER_ENV_"):
            env_key = key.replace("MCP_SERVER_ENV_", "")
            server_env[env_key] = value

    print(f"[MCP] Starting server: {command} {' '.join(args)}")
    print(f"[MCP] Environment: {list(server_env.keys())}")

    mcp_client = await mcp_stdio.stdio_client(
        server_name="mcp-server",
        server_params=mcp_stdio.StdioServerParameters(
            command=command,
            args=args,
            env=server_env if server_env else None
        )
    )

    # Get available tools
    tools_result = await mcp_client.list_tools()
    print(f"[MCP] Connected. Available tools: {[t.name for t in tools_result.tools]}")


async def stop_mcp():
    """Cleanup MCP connection."""
    global mcp_client
    if mcp_client:
        await mcp_client.close()
        print("[MCP] Connection closed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage MCP connection lifecycle."""
    await start_mcp()
    yield
    await stop_mcp()


# ============================================================================
# LLM Integration
# ============================================================================

def get_anthropic_client() -> Anthropic:
    """Get Anthropic client (or raise if not configured)."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    return Anthropic(api_key=api_key)


async def run_agent(prompt: str, session_id: str) -> ChatResponse:
    """
    Run agent with prompt, return structured events.

    This is a simplified version without conversation history,
    streaming, or advanced features. For production use, see
    vibe8n-agent full implementation.
    """
    events: List[AgentEvent] = []

    # Get available tools from MCP
    tools_result = await mcp_client.list_tools()

    # Convert MCP tools to Anthropic format
    anthropic_tools = []
    for tool in tools_result.tools:
        anthropic_tools.append({
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.inputSchema
        })

    # Call Anthropic API
    client = get_anthropic_client()

    events.append(AgentEvent(
        type="thought",
        content=f"Processing request with {len(anthropic_tools)} available tools..."
    ))

    messages = [{"role": "user", "content": prompt}]

    # Simple agentic loop (max 5 iterations)
    for iteration in range(5):
        response = client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=4096,
            messages=messages,
            tools=anthropic_tools
        )

        # Process response
        assistant_text_parts = []

        for block in response.content:
            if block.type == "text":
                assistant_text_parts.append(block.text)

            elif block.type == "tool_use":
                # Record tool call event
                events.append(AgentEvent(
                    type="tool_call",
                    content=block.name,
                    metadata={"arguments": block.input}
                ))

                # Execute tool via MCP
                try:
                    result = await mcp_client.call_tool(block.name, block.input)

                    tool_result_content = None
                    if hasattr(result, 'content') and result.content:
                        if isinstance(result.content, list) and len(result.content) > 0:
                            first_item = result.content[0]
                            if hasattr(first_item, 'text'):
                                tool_result_content = first_item.text

                    events.append(AgentEvent(
                        type="tool_result",
                        content=tool_result_content or "Success",
                        metadata={"tool": block.name}
                    ))

                    # Add to messages for next iteration
                    messages.append({
                        "role": "assistant",
                        "content": response.content
                    })
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": tool_result_content or "Success"
                        }]
                    })

                except Exception as e:
                    error_msg = str(e)
                    events.append(AgentEvent(
                        type="tool_result",
                        content=f"Error: {error_msg}",
                        metadata={"tool": block.name, "error": True}
                    ))

                    messages.append({
                        "role": "assistant",
                        "content": response.content
                    })
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": error_msg,
                            "is_error": True
                        }]
                    })

        # If no tool calls, we're done
        if response.stop_reason == "end_turn":
            final_message = "\n\n".join(assistant_text_parts)
            events.append(AgentEvent(
                type="assistant_message",
                content=final_message
            ))

            return ChatResponse(
                events=events,
                final=final_message,
                session_id=session_id
            )

    # Max iterations reached
    final_message = "Reached maximum iterations. Please try rephrasing your request."
    events.append(AgentEvent(
        type="assistant_message",
        content=final_message
    ))

    return ChatResponse(
        events=events,
        final=final_message,
        session_id=session_id
    )


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Simple vibe8n Agent",
    description="Minimal MCP agent compatible with vibe8n panel",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for n8n frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your n8n domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "mcp_connected": mcp_client is not None}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Main chat endpoint compatible with vibe8n panel.

    Expected request:
        {
            "prompt": "List my workflows",
            "session_id": "uuid-v4"
        }

    Response format:
        {
            "events": [
                {"type": "thought", "content": "Thinking..."},
                {"type": "tool_call", "content": "list_workflows", "metadata": {...}},
                {"type": "tool_result", "content": "...", "metadata": {...}},
                {"type": "assistant_message", "content": "Here are your workflows..."}
            ],
            "final": "Here are your workflows...",
            "session_id": "uuid-v4"
        }
    """
    if not mcp_client:
        raise HTTPException(status_code=503, detail="MCP server not connected")

    try:
        response = await run_agent(request.prompt, request.session_id)
        return response
    except Exception as e:
        # Return structured error
        return ChatResponse(
            events=[
                AgentEvent(
                    type="system_notice",
                    content=f"Error: {str(e)}"
                )
            ],
            final=f"Sorry, an error occurred: {str(e)}",
            session_id=request.session_id
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))

    print("""
╔════════════════════════════════════════════════════════════════╗
║           Simple vibe8n Agent - Reference Implementation       ║
╚════════════════════════════════════════════════════════════════╝

This is a minimal agent for demonstration purposes.
For production use with auth, Stripe, and advanced features,
see: https://github.com/yourusername/vibe8n-agent

Running at: http://localhost:{port}

To connect n8n-agentic frontend:
    export VITE_MCP_AGENT_API_URL=http://localhost:{port}
    pnpm --filter n8n-editor-ui serve
""".format(port=port))

    uvicorn.run(
        "simple_agent:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
