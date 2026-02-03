# Open Engineer (S-Tier Architecture)

[![CI](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml/badge.svg)](https://github.com/HsnSaboor/open-engineer/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/open-engineer.svg)](https://www.npmjs.com/package/open-engineer)

**The Autonomous Software Engineering Agent for OpenCode.**

Open Engineer is a high-performance plugin that turns OpenCode into a **Principal Engineer**. It doesn't just write code; it manages context, orchestrates swarms of specialists, enforces strict specifications, and refuses to ship broken code.

## 🚀 The S-Tier Architecture

This plugin implements the **Ralph Loop Philosophy** (Iteration > Perfection) via four core engines:

### 1. DCP (Dynamic Context Pruning)
*Context Rot is the enemy.*
- **Pruning Engine**: Automatically deduplicates and supersedes older messages to keep the context window fresh.
- **Distillation**: The AI proactively "extracts" insights from its history to save tokens.
- **Result**: You can have infinite-length sessions without degradation.

### 2. Slim Pantheon (Multi-Agent Swarm)
*One brain is not enough.*
The **Commander** (Orchestrator) delegates work to specialized sub-agents:
- **Explorer 🔭**: Reconnaissance only. Maps the territory without breaking things.
- **Fixer 🛠️**: Surgical execution. Does exactly what is planned, nothing more.
- **Oracle 🔮**: High-level architectural critique and security review.
- **Librarian 📚**: Maintains the **Code Atlas** (a persistent index of your repo).

### 3. GSD (Get Shit Done)
*Vibe coding is over. Welcome to Spec-Driven Development.*
- **Spec Stack**: Enforces a strict hierarchy: `PROJECT.md` (Vision) → `REQUIREMENTS.md` (Features) → `ROADMAP.md` (Phases).
- **Atomic Git**: Every single task is verified (test/lint) *before* being committed.
- **XML Planning**: The Planner generates rigorous XML plans (`<plan><task><verify>`) for deterministic execution.

### 4. OhMy (Relentless Autonomy)
*The agent that doesn't quit.*
- **Zero-Error Gate**: The agent CANNOT finish a task if `lsp_diagnostics` reports errors.
- **Continuation**: If `todowrite` tasks are pending, the system auto-loops until they are done.
- **Worktree Isolation**: All major changes happen in a `git worktree` sandbox, protecting your main branch.

---

## 🛠️ Usage

### Quick Start
Add to `~/.config/opencode/opencode.json`:
```json
{ "plugin": ["open-engineer"] }
```
(Or use the local path if developing: `~/.open-engineer`)

### The "One-Prompt" Workflow
You don't need to micro-manage. Just act like a Lead Engineer.

**User:**
> "The auth system is flaky. Fix it."

**Commander (Autonomous):**
1.  **Scans Repo**: Checks `PROJECT.md` and `atlas.json`.
2.  **Spawns Explorer**: Maps `src/auth`.
3.  **Spawns Planner**: Creates a GSD Plan (XML).
4.  **Spawns Fixer**: Implements the fix in a Worktree.
5.  **Verifies**: Runs tests.
6.  **Commits**: `feat(auth): fix timeout bug`
7.  **Reports**: "Fixed. Ready for review."

### Commands (Optional)
| Command | Description |
|:---|:---|
| `/gsd_init` | Bootstrap the GSD Spec Stack (`PROJECT.md` etc) |
| `/task` | Manually spawn a specific agent (e.g. `/task subagent_type="explorer" prompt="..."`) |
| `/help` | Show available tools and agents |

---

## 🤖 The Agent Roster

| Agent | Role | Model (Recommended) |
|:---|:---|:---|
| **Commander** | Orchestrator & Boss | Claude 3.5 Sonnet / Gemini 3 Pro |
| **Planner** | GSD Spec Generator | Claude 3.5 Sonnet |
| **Explorer** | Repo Mapper | Gemini 3 Flash / GPT-4o-mini |
| **Fixer** | Code Implementer | Claude 3.5 Sonnet |
| **Oracle** | Reviewer | GPT-4o / O1 |
| **Librarian** | Documentation | Gemini 3 Flash |

---

## 🛡️ Guardrails & Configuration

### Hard Rules
Create `.open-engineer/GUARDRAILS.md`. The **Constraint Reviewer** enforces these on *every* file write.
```markdown
# Critical Rules
1. NO `console.log` in production.
2. ALL database calls must be wrapped in try/catch.
```

### Style Guides
Add "Gold Standard" examples to `.mindmodel/`. The system auto-injects them when relevant.

---

## 📦 Installation & Development

```bash
git clone https://github.com/HsnSaboor/open-engineer.git ~/.open-engineer
cd ~/.open-engineer && bun install && bun run build
```

Then register it in your OpenCode config.

---

## License
MIT
