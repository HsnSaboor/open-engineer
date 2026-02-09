# Task: Implement DCP AI Distillation

## Reference
- **Spec**: [Context Engineering & Optimization (DCP)](../specs.md#1-context-engineering--optimization-dcp)
- **Detailed Spec**: [specs/dcp-ai-distillation.md](../specs/dcp-ai-distillation.md)

## Inspiration Sources
- **Tool Definition**: [inspo/opencode-dcp/lib/prompts/index.ts](../inspo/opencode-dcp/lib/prompts/index.ts)
  - *Key Logic*: Defines the `extract` and `discard` tool schemas.
- **Numeric Mapping**: [inspo/opencode-dcp/lib/messages/inject.ts](../inspo/opencode-dcp/lib/messages/inject.ts)
  - *Key Logic*: Injects the `<prunable-tools>` or `<history_map>` block into the prompt so the AI can see call IDs.

## Implementation Steps
1. Define the `extract` tool in `src/tools/pruning.ts`.
2. Implement the `injectHistoryMap` hook to show numeric IDs of previous tool calls.
3. Update the `SessionState` to support replacing tool content with the `summary` provided by the AI.
