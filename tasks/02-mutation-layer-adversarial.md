# Task: Implement Phase 2 (Mutation Layer)

## Steps

1.  **Create Agent: `adversarialReviewer`**
    *   Create `src/agents/adversarial-reviewer.ts`.
    *   Define `AgentConfig` with the "Destructive Reasoning" prompt.
    *   Set `temperature` to 0.7 (higher creativity for finding bugs).

2.  **Register Agent**
    *   Update `src/agents/index.ts` to export `adversarialReviewer`.

3.  **Verify**
    *   Create a unit test `tests/agents/adversarial-reviewer.test.ts`.
    *   Mock the agent execution (since we can't easily run LLMs in unit tests without mocking).
    *   Verify the config structure and prompt content.
