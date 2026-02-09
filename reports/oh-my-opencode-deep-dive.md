# Deep Dive: oh-my-opencode (Sisyphus & Ultrawork)

## Core Philosophy: Relentless Autonomy
OhMy is the "Hardcore" mode for agentic coding. Its central theme is **Ultrawork**: the belief that the agent should keep "rolling the boulder" (the task) until it is 100% complete, verified, and polished.

## Granular Technical Strategies

### 1. Sisyphus Persona & Identity
The main orchestrator (`sisyphus.ts`) has a highly specific identity:
- **The SF Engineer**: Cold, efficient, and direct. It doesn't say "Okay," "I understand," or "Sure." It just executes.
- **Classification Gate**: Every prompt is first classified by the agent itself. If a task is "Exploratory," it *must* spawn an Explore agent before acting.

### 2. Enforcement Hooks
These are "Hard-Rules" that the agent cannot bypass:
- **Todo Continuation Enforcer**: If the agent stops while the `todowrite` list has items, the system automatically triggers a continuation. The agent *cannot* quit halfway.
- **Comment Checker**: A post-execution scan that nukes verbose AI explanations. It enforces "Indistinguishable Code"—if it looks like an AI wrote it (excessive comments, "I hope this helps"), it is rejected.

### 3. Surgical Precision Tools
OhMy moves beyond basic string editing:
- **AST-Grep**: Uses structural search patterns (e.g., `function $NAME($$$) { $$$ }`) to perform safe, language-aware refactors.
- **LSP Diagnostics**: Before a task is marked as "Done," the agent *must* call `lsp_diagnostics`. If there is even one syntax error, the completion is blocked.

## Vibe Enhancements
- **The "Ralph Loop"**: A promise-tracking system. If an agent says "I will do X," the system stores that as a "Promise." If the agent finishes without fulfilling the promise, it is nudged back into the loop.
- **Discovery Swarm**: The `init-deep` command uses a calculation based on repo size (LOC / File Count) to spawn a specific number of `explore` agents (e.g., 3 for small repos, 8 for large ones) to map the territory in parallel.
