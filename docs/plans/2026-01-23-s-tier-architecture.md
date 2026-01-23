# S-Tier Architecture: Sandboxed Concurrency Plan

**Rating**: 10/10 (S-Tier Architecture)
**Status**: Ready for Implementation
**Goal**: Transition from a linear workflow to a Parallel, Worktree-Isolated "Swarm" workflow.

---

## 1. The Git Worktree Protocol ("Agent Sandboxing")

To prevent the agent from clogging the main repo or breaking the user's active main branch during complex tasks, all non-trivial operations will occur in Git Worktrees.

*   **Trigger Threshold**: Any task involving >1 file modification, refactoring, or migration.
*   **The Workflow**:
    1.  **Isolation**: Commander runs `git worktree add -b agent/{task-id} .worktrees/agent-{task-id} main`.
    2.  **Context Injection**: All subagents (Planner, Implementer, Reviewer) are explicitly instructed that their `root_directory` is `.worktrees/agent-{task-id}/`.
    3.  **Sandboxed Execution**: Agents create/edit files only in the worktree. The user's main directory remains untouched and clean.
    4.  **Verification**: Tests run inside the worktree.
    5.  **Atomic Merge**: Upon "S-Tier Pass" from the Reviewer, the Commander squashes and merges the worktree changes back to main (or pushes a PR), then removes the worktree.

---

## 2. The Parallel Execution Layer ("Swarm Implementation")

We will upgrade the Executor and Planner to maximize throughput using parallel subagents.

*   **Planner Upgrade**:
    *   **Dependency Graphing**: The Planner must output tasks in "Batches" (e.g., "Batch 1: Independent Utilities", "Batch 2: Components depending on Utils").
    *   **Batch Structure**:
        ```markdown
        Batch 1 (Parallel): [Task A, Task B, Task C]
        Batch 2 (Parallel): [Task D, Task E]
        ```
*   **Executor Upgrade**:
    *   **Swarm Spawning**: Instead of one-by-one, the Executor uses parallel `spawn_agent` calls to start all implementers in a batch simultaneously.
    *   **Context Gating**: Each parallel Implementer receives a distinct "Context Package" relevant only to its specific file in the worktree.

---

## 3. Detailed Agent Specifications

### A. Commander (`src/agents/commander.ts`) - "The Worktree Manager"
*   **Worktree Orchestration**: Manages the lifecyle of `.worktrees/`.
*   **Path Routing**: Passes `worktree_root` to all subagents.
*   **Gatekeeper Logic**: Checks for `.mindmodel` and triggers Migration if missing.

### B. Migration Orchestrator (`src/agents/migration-orchestrator.ts`) - "The Isolated Architect"
*   **Sandboxed Migration**: Legacy -> S-Tier migration happens in a dedicated worktree.
*   **Parity Verification**: Runs "Reverse-Spec" tests inside the worktree to guarantee 1:1 parity.

### C. Executor (`src/agents/executor.ts`) - "The Swarm Controller"
*   **Parallel Loops**: Executes batches of Implementers and Reviewers in parallel.
*   **Context Stripping**: Limits subagent context to the specific task + worktree path.

### D. Planner (`src/agents/planner.ts`) - "The Dependency Mapper"
*   **Batch-Oriented Output**: Groups tasks by dependency level.
*   **Worktree Aware**: Plans relative to execution root.

---

## 4. User Experience (UX) Improvements

1.  **Zero-Conflict Dev**: Edit main files while the agent works in a worktree.
2.  **Safety Net**: Throwaway worktrees prevent "breaking" the main branch.
3.  **Speed**: Parallel implementation of independent files.

---

## 5. Implementation Roadmap

1.  **Update `commander.ts`**: Add git worktree management tools and logic.
2.  **Update `migration-orchestrator.ts`**: Implement the Sandboxed Migration Pipeline.
3.  **Update `planner.ts`**: Implement "Parallel Batching" logic in plan generation.
4.  **Update `executor.ts`**: Implement parallel agent spawning and worktree context injection.
5.  **Update `implementer.ts`**: Ensure strict adherence to the assigned worktree path.
