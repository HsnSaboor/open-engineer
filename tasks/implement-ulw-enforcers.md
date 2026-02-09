# Task: Implement ULW Continuation Enforcers

## Reference
- **Spec**: [Autonomous "Ultrawork" Enforcers (OhMy)](../specs.md#4-autonomous-ultrawork-enforcers-ohmy)
- **Detailed Spec**: [specs/ulw-continuation-enforcers.md](../specs/ulw-continuation-enforcers.md)

## Inspiration Sources
- **Continuation Logic**: [inspo/oh-my-opencode/src/hooks/todo-continuation-enforcer.ts:46](../inspo/oh-my-opencode/src/hooks/todo-continuation-enforcer.ts)
  - *Key Logic*: `CONTINUATION_PROMPT` is injected when the agent tries to stop with pending items in its todo list.
- **Todo Tracking**: [inspo/oh-my-opencode/src/hooks/todo-continuation-enforcer.ts:238](../inspo/oh-my-opencode/src/hooks/todo-continuation-enforcer.ts)
  - *Key Logic*: Monitors session state and triggers an automated resumption if tasks remain.

## Implementation Steps
1. Implement a post-execution hook in `src/hooks/continuation-enforcer.ts`.
2. Access the `todowrite` state from the current session.
3. If pending tasks exist, inject the `CONTINUATION_PROMPT` and resume the agent loop automatically.
