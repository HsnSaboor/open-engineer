# Open Engineer: Comprehensive Architecture Analysis

[![CI](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml/badge.svg)](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/open-engineer.svg)](https://www.npmjs.com/package/open-engineer)

## 1. What is Open Engineer?

Open Engineer is an OpenCode plugin that transforms OpenCode into an autonomous "Principal Engineer" AI agent. It's designed to manage context, orchestrate swarms of specialized subagents, enforce strict specifications, and maintain high-quality code standards ("S-Tier Quality").

**Core Philosophy: The "Ralph Loop"**

The system is built on the principle that **Iteration > Perfection** - continuous improvement through autonomous cycles rather than one-shot perfection.

**Key Capabilities:**
- **Autonomous code engineering** - plans, implements, reviews, and fixes code
- **Multi-agent orchestration** - delegates work to specialized subagents
- **Context management** - prevents "context rot" in long sessions
- **Quality enforcement** - blocks code that doesn't meet standards
- **Git worktree isolation** - protects main branch with sandboxed development

---

## 2. How Does It Make LLM Calls?

### LLM Call Architecture

Open Engineer uses the `@opencode-ai/plugin` SDK to interact with OpenCode's agent system. The LLM calls happen through several mechanisms:

### A. Primary Agent System

The main entry point is in `src/index.ts` which exports a plugin that:
1. Registers agents with specific prompts and tool configurations
2. Sets up hooks that intercept and modify LLM interactions
3. Provides tools that agents can use

```typescript
// Main plugin export (src/index.ts)
const openCodeConfigPlugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  // Registers all agents, tools, and hooks
  return {
    tool: { /* all available tools */ },
    config: async (config) => { /* agent configuration */ },
    "chat.message": async () => { /* message hooks */ },
    // ... other hooks
  };
};
```

### B. Agent Definitions

Each agent has:
- **mode**: `"primary"` (can spawn subagents) or `"subagent"` (executed by others)
- **prompt**: Detailed system prompt with identity, rules, and workflow
- **temperature**: Controls randomness (0.1-0.7 depending on agent role)
- **tools**: Whitelist/blacklist of available tools

```typescript
// Example: Commander agent (src/agents/commander.ts)
export const primaryAgent: AgentConfig = {
  description: "Senior Chief Engineer. Orchestrates specialists...",
  mode: "primary",
  temperature: 0.2,
  thinking: { type: "enabled", budgetTokens: 32000 },
  maxTokens: 64000,
  tools: { spawn_agent: false }, // Uses built-in Task tool
  prompt: PROMPT,
};
```

### C. Subagent Spawning (Two Methods)

**Method 1: Native Task Tool (for non-worktree mode)**
- Primary agents use the built-in Task tool
- Synchronous execution - results available immediately
- Used when worktree mode is disabled

**Method 2: spawn_agent + wait_for_agents (for worktree mode)**
- `spawn_agent` (`src/tools/spawn-agent.ts`): Creates a new session asynchronously, returns a SessionID immediately
- `wait_for_agents` (`src/tools/wait-for-agents.ts`): Polls and aggregates results from multiple parallel agents

```typescript
// spawn_agent creates a new session and triggers async execution
await ctx.client.session.promptAsync({
  path: { id: sessionID },
  body: {
    parts: [{ type: "text", text: prompt }],
    agent: agent,
    model: model, // Inherits model from parent
  },
});
```

### D. Internal Prompts (for internal LLM calls)

Used for background operations like constraint review and mindmodel classification:

```typescript
// src/utils/internal-prompt.ts
export async function runInternalPrompt(ctx, options) {
  const sessionResult = await ctx.client.session.create({...});
  const promptResult = await ctx.client.session.prompt({...});
  // Returns the text response
}
```

---

## 3. Agent Roster & Tools

### Primary Agents (Orchestrators)

| Agent | Role | Mode | Key Characteristics |
|-------|------|------|---------------------|
| Commander | Main orchestrator | primary | Temperature 0.2, 32K thinking budget, spawns specialists |
| Brainstormer | Design collaborator | primary | Temperature 0.7, higher creativity for design exploration |

### Subagents (Specialists)

| Agent | Role | Tools | Temperature |
|-------|------|-------|-------------|
| Planner | Creates micro-task plans | spawn_agent, Task | 0.3 |
| Executor | Swarm controller for parallel execution | spawn_agent, wait_for_agents | 0.2 |
| Implementer | Executes ONE micro-task | read, write, edit, bash | 0.1 |
| Reviewer | S-Tier quality auditor | read only | 0.3 |
| Researcher | Investigates libraries/APIs | btca_, context7_, web tools | 0.4 |
| Explorer | Reconnaissance (find files/patterns) | glob, grep, read, ast_grep_search | 0.1 |
| Fixer | Surgical execution | read, write, edit, bash, ast_grep_replace | 0.2 |
| Oracle | Architectural critique | read, look_at | 0.7 |
| Librarian | Documentation maintenance | read, write | - |

### Mindmodel Agents (Code Analysis)

- mm-stack-detector, mm-pattern-discoverer, mm-example-extractor
- mm-dependency-mapper, mm-convention-extractor, mm-domain-extractor
- mm-code-clusterer, mm-anti-pattern-detector
- mm-constraint-writer, mm-constraint-reviewer

### Custom Tools Provided

| Tool | Description |
|------|-------------|
| spawn_agent | Async subagent spawning for worktree mode |
| wait_for_agents | Synchronize and collect parallel agent results |
| ast_grep_search/replace | Structural code search and transformation |
| btca_ask/resource_add/list | Ask the codebase assistant |
| look_at | Smart file inspection |
| artifact_search | Search indexed artifacts |
| extract_antipatterns | Extract anti-patterns for wisdom layer |
| lsp_* tools | LSP-based diagnostics and symbols |
| pty_* tools | PTY management for long-running processes |

---

## 4. Overall Architecture & Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPENCODE PLATFORM                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    OPEN ENGINEER PLUGIN                      │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                 src/index.ts (Entry)                 │    │   │
│  │  │  - Registers agents, tools, hooks                    │    │   │
│  │  │  - Initializes managers (LSP, PTY, Swarm)            │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                           │                                  │   │
│  │              ┌────────────┼────────────┐                    │   │
│  │              ▼            ▼            ▼                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │   │
│  │  │   AGENTS     │ │    TOOLS     │ │    HOOKS     │        │   │
│  │  │ (src/agents) │ │ (src/tools)  │ │ (src/hooks)  │        │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘        │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Workflow: Brainstorm-Research-Plan-Implement

```
User Request
     │
     ▼
┌─────────────┐     ┌─────────────────┐
│ COMMANDER   │────▶│   RESEARCHER    │ (if needed)
│ (Orchestrator)    │ (Library/API)   │
└─────────────┘     └─────────────────┘
     │
     ▼
┌─────────────┐     ┌─────────────────┐
│ BRAINSTORMER│────▶│ EXPLORER(s)     │ (parallel)
│ (Design)    │     │ CODEBASE-ANALYZER│
└─────────────┘     └─────────────────┘
     │
     ▼ creates design.md
     │
┌─────────────┐
│   PLANNER   │ creates micro-task batches
└─────────────┘
     │
     ▼ creates plan.md
     │
┌─────────────┐     ┌─────────────────────────────────────┐
│   EXECUTOR  │────▶│ PARALLEL SWARM (in worktree)        │
│ (Swarm Ctrl)│     │  ┌─────────┐  ┌─────────┐          │
└─────────────┘     │  │IMPLEMENT│  │IMPLEMENT│ (x N)    │
                    │  └─────────┘  └─────────┘          │
                    │       │            │               │
                    │       ▼            ▼               │
                    │  ┌─────────┐  ┌─────────┐          │
                    │  │ REVIEWER│  │ REVIEWER│          │
                    │  └─────────┘  └─────────┘          │
                    │       │            │               │
                    │       ▼            ▼               │
                    │  ┌──────────────────────┐          │
                    │  │ ADVERSARIAL-REVIEWER │          │
                    │  └──────────────────────┘          │
                    └─────────────────────────────────────┘
                              │
                              ▼
                        Merge & Cleanup
```

---

## 5. Key Engines (The S-Tier Architecture)

### 1. DCP (Dynamic Context Pruning)

**Location:** `src/utils/context-pruning.ts`, `src/hooks/dcp-pruner.ts`

Prevents "context rot" by automatically pruning low-signal history:
- **Deduplication**: Removes duplicate read operations
- **Supersede Writes**: Prunes old write content after subsequent reads
- **Error Decay**: Removes stale errors after N turns

```typescript
// Pruning strategies
strategies: {
  deduplication: true,
  supersedeWrites: true,
  errorPurge: { enabled: true, turnsToKeep: 4 }
}
```

### 2. Slim Pantheon (Multi-Agent Swarm)

**Location:** `src/agents/pantheon/`, `src/utils/swarm-manager.ts`

Specialized agents for specific tasks:
- **Explorer**: Reconnaissance (glob, grep, read only)
- **Fixer**: Surgical execution (single file focus)
- **Oracle**: Architectural review (read only)
- **Librarian**: Documentation maintenance

### 3. GSD (Get Shit Done)

**Location:** `src/tools/gsd.ts`, `src/utils/gsd-*.ts`

Spec-driven development:
- **Spec Stack**: PROJECT.md → REQUIREMENTS.md → ROADMAP.md
- **Atomic Git**: Each task verified before commit
- **XML Planning**: Rigorous plan format with verification steps

### 4. OhMy (Relentless Autonomy)

**Location:** `src/hooks/enforcers.ts`

Enforces quality and completion:
- **Zero-Error Gate**: Blocks task completion if LSP errors exist
- **Continuation Enforcer**: Auto-loops if todos are pending
- **Comment Checker**: Prevents AI slop (TODO, FIXME in code)

### 5. AASO (Asynchronous Swarm Orchestration)

**Location:** `src/tools/spawn-agent.ts`, `src/tools/wait-for-agents.ts`

Parallel execution without deadlocks:
- **spawn_agent**: Returns SessionID immediately
- **wait_for_agents**: Polls and aggregates results

### 6. Worktree Orchestrator

**Location:** `src/hooks/worktree-mode.ts`

Git worktree isolation:
- **Modes**: ON, OFF, AUTO (with native question tool)
- **Security Enforcement**: Blocks modifications outside worktree
- **Trigger Detection**: `@worktree:on`, `@worktree:off`

---

## 6. Hook System

Open Engineer uses a comprehensive hook system to intercept and modify LLM interactions:

| Hook | Purpose |
|------|---------|
| `chat.message` | Detect triggers (@worktree, "think" keywords) |
| `chat.params` | Inject system prompts, enable thinking mode |
| `tool.execute.before` | Validate operations, enforce worktree safety |
| `tool.execute.after` | Track file ops, inject context, check comments |
| `experimental.chat.messages.transform` | DCP pruning, mindmodel injection |
| `experimental.chat.system.transform` | Add history maps, enforce quality gates |
| `event` | Session cleanup, progress updates |

---

## 7. Configuration

**Location:** `~/.config/opencode/open-engineer.json`

```json
{
  "agents": {
    "commander": {
      "model": "anthropic/claude-3.5-sonnet",
      "temperature": 0.2
    }
  },
  "dcp": {
    "enabled": true,
    "strategies": {
      "deduplication": true,
      "supersedeWrites": true
    }
  },
  "worktreeMode": true,
  "ui": {
    "showStatusBoard": true,
    "streamSubagentThoughts": false
  }
}
```

---

## 8. Dependencies

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.1.53",
    "bun-pty": "^0.4.5",
    "valibot": "^1.2.0",
    "yaml": "^2.8.2"
  }
}
```

---

## 9. Installation & Usage

### Quick Start

**Global install** (available in all projects):

Add to `~/.config/opencode/opencode.json`:
```json
{ "plugin": ["open-engineer"] }
```

**Project-scoped install** (available only in that project):

Add `opencode.json` to your project root:
```json
{ "plugin": ["open-engineer"] }
```

Both installs include **75+ bundled skills** that are always available out of the box -- no extra setup needed.

### Development Setup

```bash
git clone https://github.com/HsnSaboor/open-engineer.git ~/.open-engineer
cd ~/.open-engineer && bun install && bun run build
```

---

## 10. Skills System

Open Engineer ships with **75+ bundled skills** covering frameworks and tools like React, Vue, Expo, Flutter, NestJS, Astro, Clerk, Apollo GraphQL, Cloudflare, databases, and more.

Skills are markdown files with YAML frontmatter that get automatically matched to your queries and injected into the AI's system prompt -- giving the agent deep, specialized knowledge for whatever you're working on.

### How It Works

1. On your **first message** in a session, the skill matcher scores all available skills against your query
2. Up to **3 best-matching skills** are auto-activated for the session
3. Skill content is injected into the system prompt as `<skill>` XML tags
4. The agent follows the skill's instructions alongside its core behavior

### Skill Precedence (3-Tier)

Skills are loaded in order of priority (later overrides earlier by name):

| Priority | Location | Description |
|----------|----------|-------------|
| 1 (lowest) | `src/skills/bundled/` | Ships with the plugin. Always available. |
| 2 | `~/.config/opencode/skills/` | Global user skills. Available in all projects. |
| 3 (highest) | `<project>/.open-engineer/skills/` | Project-specific skills. Override everything else. |

This means:
- **Bundled skills** work everywhere, zero config
- **Global custom skills** let you add your own skills available across all projects
- **Project-local skills** can override bundled or global skills for project-specific behavior

### Adding Custom Skills

Create a `*SKILL.md` or `*-SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-custom-skill
description: "Specialized instructions for my framework"
tags: ["framework", "custom"]
allowed-tools: []
---

# My Custom Skill

Instructions for the AI agent go here...
```

Drop it in:
- `~/.config/opencode/skills/my-skill/SKILL.md` for global availability
- `<project>/.open-engineer/skills/my-skill/SKILL.md` for project-specific

### Skill Matching Configuration

Configure matching behavior in `~/.config/opencode/open-engineer.json`:

```json
{
  "skillMatcher": {
    "threshold": 0.5,
    "maxResults": 5,
    "cacheResults": true,
    "providers": [
      {
        "name": "my-llm",
        "baseURL": "https://api.example.com/v1",
        "apiKey": "$MY_API_KEY",
        "model": "gpt-4o-mini"
      }
    ]
  }
}
```

Without `providers`, matching uses heuristic scoring (name, keywords, tags). Adding a provider enables LLM-based matching for better accuracy.

---

## 11. The "One-Prompt" Workflow

You don't need to micro-manage. Just act like a Lead Engineer.

**User:**
> "The auth system is flaky. Fix it."

**Commander (Autonomous):**
1. **Scans Repo**: Checks `PROJECT.md` and `atlas.json`.
2. **Triggers Swarm**: Spawns `Explorer` and `Researcher` in parallel.
3. **Synchronizes**: Calls `wait_for_agents` to collect findings.
4. **Spawns Planner**: Creates a GSD Plan (XML).
5. **Spawns Fixer**: Implements the fix in a Worktree.
6. **Verifies**: Runs tests and linting.
7. **Commits**: `feat(auth): fix timeout bug`
8. **Reports**: "Fixed. Ready for review."

---

## Summary

Open Engineer is a sophisticated multi-agent orchestration system that:

1. Uses the OpenCode plugin SDK to register agents and intercept LLM interactions
2. Implements a hierarchical agent system with Commander at the top, delegating to specialized subagents
3. Supports two delegation modes: synchronous Task tool (non-worktree) and async spawn_agent/wait_for_agents (worktree)
4. Enforces quality through hooks that inject context, prune history, and block bad code
5. Maintains isolation via git worktrees with strict path validation
6. Tracks state via managers for LSP, PTY, and Swarm orchestration

**The architecture is designed for S-Tier engineering quality - autonomous, reliable, and thoroughly reviewed code production.**

---

## License

MIT
