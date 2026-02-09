# Task: Implement Slim Pantheon Agents

## Reference
- **Spec**: [Multi-Agent Orchestration (Slim Pantheon)](../specs.md#2-multi-agent-orchestration-slim-pantheon)
- **Detailed Spec**: [specs/slim-agent-persona-prompts.md](../specs/slim-agent-persona-prompts.md)

## Inspiration Sources
- **Orchestrator Persona**: [inspo/oh-my-opencode-slim/src/agents/orchestrator.ts:139](../inspo/oh-my-opencode-slim/src/agents/orchestrator.ts)
  - *Key Logic*: `createOrchestratorAgent` implements the delegation triggers and persona identity (Senior Tech Lead).
- **Sub-agent Dispatch**: [inspo/oh-my-opencode-slim/src/features/background-agent/manager.ts](../inspo/oh-my-opencode-slim/src/features/background-agent/manager.ts)
  - *Key Logic*: Logic for fire-and-forget or fire-and-check sub-agent execution.

## Implementation Steps
1. Create specialized system prompt templates in `src/prompts/pantheon/`.
2. Update `src/tools/spawn-agent.ts` to support specific personas (`fixer`, `explorer`, `oracle`).
3. Implement the `Orchestrator`'s delegation logic to determine when to spawn a specialist.
