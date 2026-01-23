# Final Hardened S-Tier Implementation Plan

## Goal
Harden the open-engineer agent system to S-Tier standards (security handshake, worktree hygiene, parity assurance) and add a feature to force re-initialization/migration on existing projects.

## Constraints & Preferences
- **Standards**: S-Tier Engineering (Modular Architecture, Documentation, Guardrails).
- **Security**: Strictly enforce absolute path usage in the sandbox handshake: `Active worktree registered: root_directory='[ABSOLUTE_PATH_TO_WORKTREE]'`.
- **Workflow**: "Stage 0 Isolation" - All operations (including Audit) must happen inside a git worktree.
- **Parity**: Maintain 1:1 functional parity during migrations using Characterization Tests.

## Architecture Change: Stage 0 Isolation
To strictly enforce security constraints, the Git Worktree creation is moved to the very beginning (Stage 1/Stage 0).
- **Previous Flow**: Stage 1 (Audit on Main) -> Stage 2 (Worktree Refactor) -> Stage 3 (Quality Loop)
- **New S-Tier Flow**: Stage 1 (Worktree Creation & Audit) -> Stage 2 (Refactor) -> Stage 3 (Quality Loop)
- **Benefit**: No agent ever touches the live main branch for analysis or modification. All agents can validly use the mandatory security handshake.

## Implementation Steps

### 1. Orchestrator Logic Update (`src/agents/migration-orchestrator.ts`)
- **Dirty State Check**: Before anything, run `git status --porcelain`.
  - If dirty: Fail fast and request user to stash/commit.
- **Cleanup**: Check for and remove existing `.worktrees/migration-refactor` using `git worktree remove --force`.
- **Stage 1 Update**:
  - Create the worktree immediately.
  - Output the security handshake.
  - Spawn `codebase-locator` and `codebase-analyzer` *inside* the worktree with the absolute path.

### 2. Universal Agent Hardening (The "All-In" Approach)
All agents must output the handshake string as their **very first action**. This ensures the security hook verifies they are operating in the registered sandbox.

**Target Agents:**
- `src/agents/reviewer.ts`
- `src/agents/planner.ts`
- `src/agents/codebase-locator.ts`
- `src/agents/codebase-analyzer.ts`
- `src/agents/pattern-finder.ts`

**Prompt Injection:**
```xml
<security-protocol>
CRITICAL: You MUST output the line "Active worktree registered: root_directory='[ABSOLUTE_PATH_TO_WORKTREE]'" as your very first action.
This is required to enable the security sandbox.
</security-protocol>
```

### 3. Verification Plan
- **Build**: `bun run build`
- **Dirty State Test**:
  - Create a dummy change in the test repo.
  - Run "re-initialize the project" via PTY.
  - Expect failure/warning.
- **Isolation Test**:
  - Clean the repo.
  - Run "re-initialize the project".
  - Verify worktree is created BEFORE analysis agents start.
  - Verify all spawned agents output the handshake.

## Progress Tracking
- [x] Spec Update (This File)
- [ ] Orchestrator Logic (Dirty Check, Stage 0 Worktree)
- [ ] Agent Hardening (Reviewer)
- [ ] Agent Hardening (Planner)
- [ ] Agent Hardening (Locator)
- [ ] Agent Hardening (Analyzer)
- [ ] Agent Hardening (Pattern Finder)
- [ ] Build & Verify
