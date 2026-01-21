# open-engineer

[![CI](https://github.com/vtemian/open-engineer/actions/workflows/ci.yml/badge.svg)](https://github.com/vtemian/open-engineer/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/open-engineer.svg)](https://www.npmjs.com/package/open-engineer)

OpenCode plugin with structured Brainstorm → Plan → Implement workflow and session continuity.

https://github.com/user-attachments/assets/85236ad3-e78a-4ff7-a840-620f6ea2f512

## Quick Start

Add to `~/.config/opencode/opencode.json`:

```json
{ "plugin": ["open-engineer"] }
```

Then run `/init` to generate `ARCHITECTURE.md`, `CODE_STYLE.md`, and `.open-engineer/GUARDRAILS.md`.

## Workflow

```
Research → Brainstorm → Plan → Implement
   ↓          ↓          ↓        ↓
research   design     research  executor
```

### 1. Research (New!)
Before brainstorming, the **Researcher** agent investigates libraries, APIs, and architectural patterns. It produces a "Research Brief" to ground the design in reality, preventing hallucinations about non-existent APIs.

### 2. Brainstorm
Refine ideas into designs through collaborative questioning. Uses the Research Brief as a source of truth. Output: `thoughts/shared/designs/YYYY-MM-DD-{topic}-design.md`

### 3. Plan  
Transform designs into implementation plans with bite-sized tasks (2-5 min each), exact file paths, and TDD workflow. Output: `thoughts/shared/plans/YYYY-MM-DD-{topic}.md`

### 4. Implement
Execute in git worktree for isolation. The **Executor** orchestrates implementer→reviewer cycles with parallel execution via fire-and-check pattern.

### 5. Session Continuity
Maintain context across sessions with structured compaction. Run `/ledger` to create/update `thoughts/ledgers/CONTINUITY_{session}.md`.

## Key Features & Improvements

### 🛡️ Guardrails System
Strictly enforce project rules using `.open-engineer/GUARDRAILS.md`.
- **Enforcement**: A dedicated hook blocks any file write that violates these rules.
- **Conversational**: Tell the Commander "Always use Bun" and it will write the rule for you.

### 👨‍💻 Senior Staff Standards
- **Verify First**: Agents must verify assumptions before designing.
- **Failure Mode Testing**: Implementers must write tests for failure cases, not just happy paths.
- **Atomic Cleanup**: "Scout Rule" is encouraged during implementation.
- **Safety Protocol**: "Quick Mode" tasks require a read-lint-test safety cycle.

## Commands

| Command | Description |
|---------|-------------|
| `/init` | Initialize project docs |
| `/ledger` | Create/update continuity ledger |
| `/search` | Search past plans and ledgers |

## Agents

| Agent | Purpose |
|-------|---------|
| commander | Orchestrator |
| researcher | Deep technical research |
| brainstormer | Design exploration |
| planner | Implementation plans |
| executor | Orchestrate implement→review |
| implementer | Execute tasks |
| reviewer | Check correctness |
| codebase-locator | Find file locations |
| codebase-analyzer | Deep code analysis |
| pattern-finder | Find existing patterns |
| project-initializer | Generate project docs |
| ledger-creator | Continuity ledgers |
| artifact-searcher | Search past work |

## Tools

| Tool | Description |
|------|-------------|
| `ast_grep_search` | AST-aware code pattern search |
| `ast_grep_replace` | AST-aware code pattern replacement |
| `look_at` | Extract file structure |
| `artifact_search` | Search past plans/ledgers |
| `btca_ask` | Query library source code |
| `pty_spawn` | Start background terminal session |
| `pty_write` | Send input to PTY |
| `pty_read` | Read PTY output |
| `pty_list` | List PTY sessions |
| `pty_kill` | Terminate PTY |

## Hooks

- **Think Mode** - Keywords like "think hard" enable 32k token thinking budget
- **Ledger Loader** - Injects continuity ledger into system prompt
- **Auto-Compact** - At 50% context usage, automatically summarizes session to reduce context
- **File Ops Tracker** - Tracks read/write/edit for deterministic logging
- **Artifact Auto-Index** - Indexes artifacts in thoughts/ directories
- **Context Injector** - Injects ARCHITECTURE.md, CODE_STYLE.md, and GUARDRAILS.md
- **Token-Aware Truncation** - Truncates large tool outputs
- **Constraint Reviewer** - Enforces Guardrails on every file write

## Development

```bash
git clone git@github.com:vtemian/open-engineer.git ~/.open-engineer
cd ~/.open-engineer && bun install && bun run build
```

```json
// Use local path
{ "plugin": ["~/.open-engineer"] }
```

### Release

```bash
npm version patch  # or minor, major
git push --follow-tags
```

## Philosophy

1. **Research first** - Don't guess APIs
2. **Brainstorm second** - Refine ideas before coding
3. **Plan with human buy-in** - Get approval before coding
4. **Parallel investigation** - Spawn multiple subagents
5. **Isolated implementation** - Use git worktrees
6. **Continuous verification** - Implementer + Reviewer per task
7. **Session continuity** - Never lose context
8. **Guardrails** - Enforce architectural laws

## Inspiration & Credits

- **[micode](https://github.com/vtemian/micode)** - The original foundation this project is based on.
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) - Plugin architecture
- [HumanLayer ACE-FCA](https://github.com/humanlayer/12-factor-agents) - Structured workflows
- [Factory.ai](https://factory.ai/blog/context-compression) - Structured compaction research

