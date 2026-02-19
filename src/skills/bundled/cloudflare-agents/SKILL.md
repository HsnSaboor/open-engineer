---
name: cloudflare-agents
description: |
  Build AI agents on Cloudflare Workers using the Agents SDK with state management,
  real-time WebSockets, scheduled tasks, tool integration, MCP servers, workflows,
  and chat capabilities. Generates production-ready agent code deployed to Workers.

  Use when: user wants to "build an agent", "AI agent", "chat agent", "stateful
  agent", mentions "Agents SDK", needs "real-time AI", "WebSocket AI", or asks
  about agent "state management", "scheduled tasks", "tool calling", "MCP servers",
  "workflows", or "durable objects".
---

# Cloudflare Agents SDK

**STOP.** Your knowledge of the Agents SDK may be outdated. Prefer retrieval over pre-training for any Agents SDK task.

## When to Use

- User wants to build an AI agent or chatbot
- User needs stateful, real-time AI interactions
- User asks about the Cloudflare Agents SDK
- User wants scheduled tasks or background AI work
- User needs WebSocket-based AI communication
- User needs durable workflows or MCP integration

## Documentation

Fetch current docs from `https://github.com/cloudflare/agents/tree/main/docs` before implementing.

| Topic | Doc | Use for |
|-------|-----|---------|
| Getting started | `docs/getting-started.md` | First agent, project setup |
| State | `docs/state.md` | `setState`, `validateStateChange`, persistence |
| Routing | `docs/routing.md` | URL patterns, `routeAgentRequest`, `basePath` |
| Callable methods | `docs/callable-methods.md` | `@callable`, RPC, streaming, timeouts |
| Scheduling | `docs/scheduling.md` | `schedule()`, `scheduleEvery()`, cron |
| Workflows | `docs/workflows.md` | `AgentWorkflow`, durable multi-step tasks |
| HTTP/WebSockets | `docs/http-websockets.md` | Lifecycle hooks, hibernation |
| Email | `docs/email.md` | Email routing, secure reply resolver |
| MCP client | `docs/mcp-client.md` | Connecting to MCP servers |
| MCP server | `docs/mcp-servers.md` | Building MCP servers with `McpAgent` |
| Client SDK | `docs/client-sdk.md` | `useAgent`, `useAgentChat`, React hooks |
| Human-in-the-loop | `docs/human-in-the-loop.md` | Approval flows, pausing workflows |
| Resumable streaming | `docs/resumable-streaming.md` | Stream recovery on disconnect |

Cloudflare docs: https://developers.cloudflare.com/agents/

## Prerequisites

- Cloudflare account with Workers enabled
- Node.js 18+ and npm/pnpm/yarn
- Wrangler CLI (`npm install -g wrangler`)

## Quick Start

```bash
npm create cloudflare@latest -- my-agent --template=cloudflare/agents-starter
cd my-agent
npm start
```

Agent runs at `http://localhost:8787`

## Capabilities

The Agents SDK provides:

- **Persistent state** - SQLite-backed, auto-synced to clients
- **Callable RPC** - `@callable()` methods invoked over WebSocket
- **Scheduling** - One-time, recurring (`scheduleEvery`), and cron tasks
- **Workflows** - Durable multi-step background processing via `AgentWorkflow`
- **MCP integration** - Connect to MCP servers or build your own with `McpAgent`
- **Email handling** - Receive and reply to emails with secure routing
- **Streaming chat** - `AIChatAgent` with resumable streams
- **React hooks** - `useAgent`, `useAgentChat` for client apps

## FIRST: Verify Installation

```bash
npm ls agents  # Should show agents package
```

If not installed:
```bash
npm install agents
```

## Core Concepts

### What is an Agent?

An Agent is a stateful, persistent AI service that:
- Maintains state across requests and reconnections
- Communicates via WebSockets or HTTP
- Runs on Cloudflare's edge via Durable Objects
- Can schedule tasks and call tools
- Scales horizontally (each user/session gets own instance)

### Agent Lifecycle

```
Client connects → Agent.onConnect() → Agent processes messages
                                    → Agent.onMessage()
                                    → Agent.setState() (persists + syncs)
Client disconnects → State persists → Client reconnects → State restored
```

## Basic Agent Structure

```typescript
import { Agent, Connection, routeAgentRequest, callable } from "agents";

type Env = {
  AI: Ai;  // Workers AI binding
};

type State = {
  messages: Array<{ role: string; content: string }>;
  count: number;
};

export class MyAgent extends Agent<Env, State> {
  initialState: State = { messages: [], count: 0 };

  // Validation hook - runs before state persists (sync, throwing rejects the update)
  validateStateChange(nextState: State, source: Connection | "server") {
    if (nextState.count < 0) throw new Error("Count cannot be negative");
  }

  // Notification hook - runs after state persists (async, non-blocking)
  onStateUpdate(state: State, source: Connection | "server") {
    console.log("State updated:", state);
  }

  async onStart() {
    console.log("Agent started with state:", this.state);
  }

  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({
      type: "welcome",
      history: this.state.messages,
    }));
  }

  async onMessage(connection: Connection, message: string) {
    const data = JSON.parse(message);
    if (data.type === "chat") {
      await this.handleChat(connection, data.content);
    }
  }

  async onClose(connection: Connection) {
    console.log("Client disconnected");
  }

  @callable()
  increment() {
    this.setState({ ...this.state, count: this.state.count + 1 });
    return this.state.count;
  }

  private async handleChat(connection: Connection, userMessage: string) {
    const messages = [
      ...this.state.messages,
      { role: "user", content: userMessage },
    ];

    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages,
    });

    this.setState({
      ...this.state,
      messages: [
        ...messages,
        { role: "assistant", content: response.response },
      ],
    });

    connection.send(JSON.stringify({
      type: "response",
      content: response.response,
    }));
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
};
```

## Wrangler Configuration

**TOML format:**
```toml
name = "my-agent"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[ai]
binding = "AI"

[durable_objects]
bindings = [{ name = "AGENT", class_name = "MyAgent" }]

[[migrations]]
tag = "v1"
new_classes = ["MyAgent"]
```

**JSONC format:**
```jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "MyAgent", "class_name": "MyAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyAgent"] }]
}
```

## Routing

Requests route to `/agents/{agent-name}/{instance-name}`:

| Class | URL |
|-------|-----|
| `Counter` | `/agents/counter/user-123` |
| `ChatRoom` | `/agents/chat-room/lobby` |

Client: `useAgent({ agent: "Counter", name: "user-123" })`

Clients connect via: `wss://my-agent.workers.dev/agents/MyAgent/session-id`

## Core APIs

| Task | API |
|------|-----|
| Read state | `this.state.count` |
| Write state | `this.setState({ count: 1 })` |
| SQL query | `` this.sql`SELECT * FROM users WHERE id = ${id}` `` |
| Schedule (delay) | `await this.schedule(60, "task", payload)` |
| Schedule (cron) | `await this.schedule("0 * * * *", "task", payload)` |
| Schedule (interval) | `await this.scheduleEvery(30, "poll")` |
| Schedule (date) | `await this.schedule(new Date("2025-01-01"), "task", {})` |
| Get schedules | `const schedules = await this.getSchedules()` |
| Cancel schedule | `await this.cancelSchedule(taskId)` |
| RPC method | `@callable() myMethod() { ... }` |
| Streaming RPC | `@callable({ streaming: true }) stream(res) { ... }` |
| Start workflow | `await this.runWorkflow("ProcessingWorkflow", params)` |

## State Management

### Reading State
```typescript
const currentMessages = this.state.messages;
const userPrefs = this.state.preferences;
```

### Updating State
```typescript
// setState persists AND syncs to all connected clients
this.setState({
  ...this.state,
  messages: [...this.state.messages, newMessage],
});

// Partial updates work too
this.setState({
  preferences: { ...this.state.preferences, theme: "dark" },
});
```

### SQL Storage

For complex queries, use the embedded SQLite database:

```typescript
// Create tables
await this.sql`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

// Insert
await this.sql`
  INSERT INTO documents (title, content)
  VALUES (${title}, ${content})
`;

// Query
const docs = await this.sql`
  SELECT * FROM documents WHERE title LIKE ${`%${search}%`}
`;
```

## Scheduled Tasks

```typescript
async onMessage(connection: Connection, message: string) {
  const data = JSON.parse(message);

  if (data.type === "schedule_reminder") {
    const { id } = await this.schedule(3600, "sendReminder", {
      message: data.reminderText,
      userId: data.userId,
    });
    connection.send(JSON.stringify({ type: "scheduled", taskId: id }));
  }
}

async sendReminder(data: { message: string; userId: string }) {
  console.log(`Reminder for ${data.userId}: ${data.message}`);
  this.setState({
    ...this.state,
    lastReminder: new Date().toISOString(),
  });
}
```

### Schedule Options

```typescript
// Delay in seconds
await this.schedule(60, "taskMethod", { data });

// Specific date
await this.schedule(new Date("2025-01-01T00:00:00Z"), "taskMethod", { data });

// Cron expression (recurring)
await this.schedule("0 9 * * *", "dailyTask", {});  // 9 AM daily
await this.schedule("*/5 * * * *", "everyFiveMinutes", {});  // Every 5 min

// Manage schedules
const schedules = await this.getSchedules();
await this.cancelSchedule(taskId);
```

## Chat Agent (AI-Powered)

For chat-focused agents, extend `AIChatAgent`:

```typescript
import { AIChatAgent } from "agents/ai-chat-agent";

export class ChatBot extends AIChatAgent<Env> {
  async onChatMessage(message: string) {
    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        ...this.messages,  // Automatic history management
        { role: "user", content: message },
      ],
      stream: true,
    });

    return response;
  }
}
```

Features included:
- Automatic message history
- Resumable streaming (survives disconnects)
- Built-in `saveMessages()` for persistence

## Client Integration

### React Hook

```tsx
import { useAgent } from "agents/react";

function App() {
  const [state, setLocalState] = useState({ count: 0 });

  const agent = useAgent({
    agent: "Counter",
    name: "my-instance",
    onStateUpdate: (newState) => setLocalState(newState),
    onIdentity: (name, agentType) => console.log(`Connected to ${name}`)
  });

  return (
    <button onClick={() => agent.setState({ count: state.count + 1 })}>
      Count: {state.count}
    </button>
  );
}
```

### Chat with useAgentChat

```tsx
import { useAgentChat } from "agents/react";

function Chat() {
  const { state, send, connected } = useAgent({
    agent: "my-agent",
    name: userId,
  });

  const sendMessage = (text: string) => {
    send(JSON.stringify({ type: "chat", content: text }));
  };

  return (
    <div>
      {state.messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.content}</div>
      ))}
      <input onKeyDown={(e) => e.key === "Enter" && sendMessage(e.target.value)} />
    </div>
  );
}
```

### Vanilla JavaScript

```javascript
const ws = new WebSocket("wss://my-agent.workers.dev/agents/MyAgent/user123");

ws.onopen = () => {
  console.log("Connected to agent");
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};

ws.send(JSON.stringify({ type: "chat", content: "Hello!" }));
```

## Deployment

```bash
# Deploy
npx wrangler deploy

# View logs
wrangler tail

# Test endpoint
curl https://my-agent.workers.dev/agents/MyAgent/test-user
```

## Common Patterns

See references for:
- Tool calling and function execution
- Multi-agent orchestration
- RAG (Retrieval Augmented Generation)
- Human-in-the-loop workflows

## Troubleshooting

See references for common issues and error solutions.

## References

- **[references/workflows.md](references/workflows.md)** - Durable Workflows integration
- **[references/callable.md](references/callable.md)** - RPC methods, streaming, timeouts
- **[references/state-scheduling.md](references/state-scheduling.md)** - State persistence, scheduling
- **[references/streaming-chat.md](references/streaming-chat.md)** - AIChatAgent, resumable streams
- **[references/mcp.md](references/mcp.md)** - MCP server integration
- **[references/email.md](references/email.md)** - Email routing and handling
- **[references/codemode.md](references/codemode.md)** - Code Mode (experimental)
- **[references/examples.md](references/examples.md)** - Official templates and production examples
- **[references/agent-patterns.md](references/agent-patterns.md)** - Advanced patterns
- **[references/state-patterns.md](references/state-patterns.md)** - State management strategies
- **[references/troubleshooting.md](references/troubleshooting.md)** - Error solutions
