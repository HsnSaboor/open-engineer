# .opencode

Minimal OpenCode plugin with Brainstorm-Research-Plan-Implement workflow.

## Installation

```bash
# Clone the repo
git clone git@github.com:vtemian/.opencode.git ~/.opencode

# Install and build
cd ~/.opencode
bun install
bun run build
```

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "/path/to/.opencode/dist/index.js"
  ]
}
```

## Workflow

```
/brainstorm → /research → /plan → /implement
```

| Command | Description |
|---------|-------------|
| `/brainstorm` | Refine ideas into designs through collaborative questioning |
| `/research` | Investigate codebase with parallel sub-agents |
| `/plan` | Create detailed implementation plan |
| `/implement` | Execute plan with parallel implementer + reviewer |
| `/create-handoff` | Save session state for continuity |
| `/resume-handoff` | Resume from previous session |

## Agents

| Agent | Purpose |
|-------|---------|
| `brainstormer` | Refines ideas into designs (one question at a time, YAGNI) |
| `codebase-locator` | Finds WHERE files live (no content analysis) |
| `codebase-analyzer` | Explains HOW code works (with file:line refs) |
| `pattern-finder` | Shows existing patterns to model after |
| `implementer` | Executes implementation tasks |
| `reviewer` | Reviews implementation for correctness |

## Tools

| Tool | Description |
|------|-------------|
| `lsp_hover` | Get type info and docs for a symbol |
| `lsp_goto_definition` | Find where a symbol is defined |
| `lsp_find_references` | Find all usages of a symbol |
| `lsp_document_symbols` | Get all symbols in a file |
| `lsp_workspace_symbols` | Search symbols across workspace |
| `ast_grep_search` | AST-aware code pattern search |
| `ast_grep_replace` | AST-aware code pattern replacement |

## Hooks

### Think Mode

Use these keywords to enable extended thinking (32k tokens):
- "think hard", "think deeply", "think carefully", "let's think"

### Auto-Compact

Automatically summarizes session when hitting token limits.

## MCP Servers

| Server | Description |
|--------|-------------|
| `context7` | Documentation lookup |

## Structure

```
.opencode/
├── src/
│   ├── agents/       # Agent definitions (TypeScript)
│   ├── tools/        # LSP and AST-grep tools
│   ├── hooks/        # Auto-compact hook
│   └── index.ts      # Plugin entry
├── command/          # Slash commands (markdown)
├── dist/             # Built plugin
└── thoughts/         # Artifacts (gitignored)
    └── shared/
        ├── designs/    # Brainstorm outputs
        ├── research/   # Research documents
        ├── plans/      # Implementation plans
        └── handoffs/   # Session handoffs
```

## Development

```bash
bun install      # Install dependencies
bun run build    # Build plugin
bun run typecheck # Type check
```

## Philosophy

Inspired by [HumanLayer's ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) and [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode).

1. **Brainstorm first** - Refine ideas before coding
2. **Research before implementing** - Understand the codebase
3. **Plan with human buy-in** - Get approval before coding
4. **Parallel verification** - Implementer and reviewer work together
