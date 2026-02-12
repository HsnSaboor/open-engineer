# Task: Implement Phase 1 (Wisdom Layer)

## Steps

1.  **Create Tool: `extract_antipatterns`**
    *   Create `src/tools/wisdom/extract-antipatterns.ts`.
    *   Implement logic to append to `.mindmodel/ANTIPATTERNS.md` (creating if missing).
    *   Register in `src/tools/index.ts`.

2.  **Update Planner Agent**
    *   Modify `src/agents/planner.ts`.
    *   Add instructions to the `prompt` to read `.mindmodel/ANTIPATTERNS.md`.
    *   Add a `<wisdom-protocol>` section to the prompt.

3.  **Verify**
    *   Create a unit test `tests/wisdom/extract-antipatterns.test.ts`.
    *   Test appending to the file.
    *   Test file creation.
