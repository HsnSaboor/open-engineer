# Task: Implement GSD Atomic Git Protocol

## Reference
- **Spec**: [Spec-Driven Development (GSD)](../specs.md#3-spec-driven-development-gsd)
- **Detailed Spec**: [specs/gsd-atomic-git-protocol.md](../specs/gsd-atomic-git-protocol.md)

## Inspiration Sources
- **Atomic Commits**: [inspo/get-shit-done/hooks/post-task-commit.sh](../inspo/get-shit-done/hooks/post-task-commit.sh) (Look for commit logic).
- **Task Management**: [inspo/get-shit-done/README.md:350](../inspo/get-shit-done/README.md)
  - *Key Logic*: Describes the 1-to-1 mapping of tasks to commits and the benefits for traceability.

## Implementation Steps
1. Create a `GitAtomicManager` in `src/utils/git.ts`.
2. Modify the `Executor` loop to automatically execute a `git commit` after every XML task success.
3. Ensure the commit message is formatted as `feat(Phase-Task): [Description]`.
