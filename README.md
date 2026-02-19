# Open Engineer

[![CI](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml/badge.svg)](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/open-engineer.svg)](https://www.npmjs.com/package/open-engineer)

An [OpenCode](https://opencode.ai) plugin that transforms your coding agent into an autonomous **Principal Engineer** -- capable of planning, implementing, reviewing, and shipping code with multi-agent orchestration and strict quality enforcement.

## Quick Start

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

Both installs include **75 bundled skills** that work out of the box -- no extra setup needed.

---

## Key Capabilities

- **Autonomous code engineering** -- plans, implements, reviews, and fixes code end-to-end
- **Multi-agent orchestration** -- delegates work to specialized subagents (planner, implementer, reviewer, etc.)
- **75+ bundled skills** -- deep knowledge for React, Vue, Expo, Flutter, NestJS, Astro, Cloudflare, Apollo GraphQL, and more
- **Context management (DCP)** -- prevents context rot in long sessions via automatic history pruning
- **Quality enforcement** -- blocks code with LSP errors, TODO/FIXME comments, or incomplete tasks
- **Git worktree isolation** -- sandboxed development that protects your main branch

---

## How It Works

Open Engineer uses the `@opencode-ai/plugin` SDK to register agents, tools, and hooks into OpenCode's runtime. When you send a message, the Commander agent orchestrates a pipeline:

```
User Request
     |
     v
 COMMANDER (orchestrator)
     |
     +---> RESEARCHER (library/API investigation)
     +---> EXPLORER (codebase reconnaissance)
     |
     v
 PLANNER (creates micro-task batches)
     |
     v
 EXECUTOR (swarm controller)
     |
     +---> IMPLEMENTER x N (parallel, one file each)
     +---> REVIEWER x N (quality audit per task)
     +---> ADVERSARIAL-REVIEWER (destructive review)
     |
     v
 Merge & Cleanup
```

You don't need to micro-manage. Just describe the problem:

> "The auth system is flaky. Fix it."

The Commander will scan the repo, spawn specialists in parallel, plan fixes, implement them in a worktree, verify with tests, and commit -- all autonomously.

---

## Agent Roster

### Primary Agents (Orchestrators)

| Agent | Role | Temperature |
|-------|------|-------------|
| Commander | Main orchestrator, spawns specialists | 0.2 |
| Brainstormer | Design collaborator, higher creativity | 0.7 |

### Subagents (Specialists)

| Agent | Role | Temperature |
|-------|------|-------------|
| Planner | Creates micro-task plans | 0.3 |
| Executor | Swarm controller for parallel execution | 0.2 |
| Implementer | Executes one micro-task (single file focus) | 0.1 |
| Reviewer | Quality auditor per task | 0.3 |
| Adversarial Reviewer | Destructive review, finds logic gaps | 0.3 |
| Researcher | Investigates libraries and APIs | 0.4 |
| Explorer | Reconnaissance (find files, patterns) | 0.1 |
| Fixer | Surgical single-file execution | 0.2 |
| Oracle | Architectural critique | 0.7 |
| Librarian | Documentation maintenance | -- |

### Mindmodel Agents (Code Analysis)

A suite of agents that analyze your codebase and generate a `.mindmodel/` directory with stack info, patterns, conventions, and domain knowledge:

- `mm-stack-detector`, `mm-pattern-discoverer`, `mm-example-extractor`
- `mm-dependency-mapper`, `mm-convention-extractor`, `mm-domain-extractor`
- `mm-code-clusterer`, `mm-anti-pattern-detector`
- `mm-constraint-writer`, `mm-constraint-reviewer`

---

## Core Engines

### DCP (Dynamic Context Pruning)

Prevents context rot by automatically pruning low-signal history:

- **Deduplication** -- removes duplicate read operations
- **Supersede Writes** -- prunes old write content after subsequent reads
- **Error Decay** -- removes stale errors after N turns

### GSD (Get Shit Done)

Spec-driven development with atomic commits:

- **Spec Stack**: `PROJECT.md` -> `REQUIREMENTS.md` -> `ROADMAP.md`
- **Atomic Git**: each task verified before commit
- **XML Planning**: rigorous plan format with verification steps

### Quality Gates (OhMy)

Enforces completion and quality:

- **Zero-Error Gate** -- blocks task completion if LSP errors exist
- **Continuation Enforcer** -- auto-loops if todos are pending
- **Comment Checker** -- prevents AI slop (TODO, FIXME in committed code)

### Worktree Orchestrator

Git worktree isolation for safe parallel development:

- **Modes**: ON, OFF, AUTO (prompted via native question tool)
- **Security Enforcement** -- blocks modifications outside worktree
- **Triggers**: `@worktree:on`, `@worktree:off`

---

## Skills System

Open Engineer ships with **75 bundled skills** covering frameworks and tools like React, Vue, Expo, Flutter, NestJS, Astro, Clerk, Apollo GraphQL, Cloudflare, databases, and more.

Skills are markdown files with YAML frontmatter that get automatically matched to your queries and injected into the system prompt -- giving the agent deep, specialized knowledge for whatever you're working on.

### How Skill Matching Works

1. On your **first message** in a session, the skill matcher scores all available skills against your query
2. Up to **3 best-matching skills** are auto-activated for the session
3. Skill content is injected into the system prompt as `<skill>` XML tags

### Skill Precedence (3-Tier)

| Priority | Location | Description |
|----------|----------|-------------|
| 1 (lowest) | `src/skills/bundled/` | Ships with the plugin. Always available. |
| 2 | `~/.config/opencode/skills/` | Global user skills. Available in all projects. |
| 3 (highest) | `<project>/.open-engineer/skills/` | Project-specific. Overrides everything else. |

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

## Hook System

Open Engineer intercepts and modifies LLM interactions through hooks:

| Hook | Purpose |
|------|---------|
| `chat.message` | Detect triggers (`@worktree`, "think" keywords) |
| `chat.params` | Inject system prompts, enable thinking mode |
| `tool.execute.before` | Validate operations, enforce worktree safety |
| `tool.execute.after` | Track file ops, inject context, check comments |
| `experimental.chat.messages.transform` | DCP pruning, mindmodel injection |
| `experimental.chat.system.transform` | History maps, quality gates |
| `event` | Session cleanup, progress updates |

---

## Configuration

Create `~/.config/opencode/open-engineer.json`:

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

## Development Setup

```bash
git clone https://github.com/HsnSaboor/open-engineer.git
cd open-engineer
bun install
bun run build
```

```bash
bun test          # run tests
bun run typecheck # type checking
bun run lint      # linting
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@opencode-ai/plugin` | OpenCode plugin SDK |
| `bun-pty` | PTY management for long-running processes |
| `valibot` | Schema validation |
| `yaml` | YAML parsing for skills and configs |

---

## License

MIT
