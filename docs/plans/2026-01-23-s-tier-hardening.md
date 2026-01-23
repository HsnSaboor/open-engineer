# Final Hardened S-Tier Implementation Plan (2026-01-23)

## 1. Security Handshake (Sandbox Activation)
Objective: Ensure the `WorktreeEnforcerHook` is activated by forcing agents to announce the worktree root using an absolute path.

*   **Commander (`src/agents/commander.ts`)**: 
    *   Update `WORKTREE PROTOCOL` to mandate: `Active worktree registered: root_directory='[ABSOLUTE_PATH_TO_WORKTREE]'`
*   **Executor (`src/agents/executor.ts`)**: 
    *   Update `parse-plan` phase to output the handshake with the absolute worktree root.
*   **Implementer (`src/agents/implementer.ts`)**: 
    *   Update `process` to output the handshake with the absolute worktree root before any file operations.
*   **Migration Orchestrator (`src/agents/migration-orchestrator.ts`)**: 
    *   Update `Stage 2` to output the handshake with the absolute worktree root.

## 2. Worktree Lifecycle (Hygiene)
Objective: Ensure zero debris is left after a task and changes are atomically committed.

*   **Commander (`src/agents/commander.ts`)**:
    *   Add `<phase name="merge-and-cleanup">` to the workflow:
        1. `git merge --squash agent-task-id`
        2. `git commit -m "feat: [task] - implementation complete"`
        3. `git worktree remove .worktrees/agent-task-id --force`
        4. `git branch -D agent-task-id`

## 3. Parity Assurance (Reverse-Spec)
Objective: Guarantee 1:1 behavior preservation during migration and refactoring.

*   **Planner (`src/agents/planner.ts`)**:
    *   Add `<migration-protocol>`:
        *   IF refactoring/migrating: Generate **Characterization Tests** that capture current behavior (including existing bugs/quirks).
        *   Goal: 1:1 functional parity (Tests must pass on both old and new code).

---

## Verification Plan
1.  **Regex Validation**: Confirm that the instruction to use "Absolute Paths" in the handshake satisfies the `.+?\.worktrees` requirement in the `src/hooks/worktree-enforcer.ts` regex: `root_directory=["'](.+?\.worktrees\/agent-.+?)["']`.
2.  **Lifecycle Audit**: Verify that the Commander now has a clear path from creation -> isolation -> swarm -> merge -> cleanup.
