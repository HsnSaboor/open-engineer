# Deep Dive: Get Shit Done (GSD) (Spec-Driven Reliability)

## Core Philosophy: Goal-Backward Development
GSD is designed for "Solo-Founders" who want to build complex apps reliably. It treats coding as a **deterministic pipeline** rather than a conversation. It solves "Context Rot" by making every execution phase effectively stateless.

## Granular Technical Strategies

### 1. The Spec Stack Lifecycle
GSD enforces a mandatory documentation flow:
- **`PROJECT.md`**: Captures the "Core Value" (the one thing that cannot break).
- **`REQUIREMENTS.md`**: Uses a **Traceability Matrix** (Requirement ID -> Phase ID).
- **`STATE.md`**: Tracks "Velocity" and "Accumulated Context" (decisions that aren't in code yet).

### 2. Wave-Based Execution Engine
GSD pre-calculates the "Wave" for every plan:
- **Wave 0**: Independent research and scaffolding.
- **Wave 1**: Core logic/API implementation.
- **Wave 2**: UI/Integration (depends on Wave 1).
- **Parallelism**: All plans in the same wave are executed simultaneously via background sub-agents.

### 3. XML Atomic Task Specification
Plans in GSD are not just text; they are machine-readable XML:
- `<task type="auto|checkpoint">`: Distinguishes between what the AI can do alone and what needs human approval.
- `<verify>`: A mandatory field. Usually a CLI command or a specific file check.
- `<done>`: A declarative statement of what must be TRUE.

## Vibe Enhancements
- **Atomic Git Protocol**: Every single XML task results in a specific git commit. If an execution phase has 5 tasks, you get 5 clean, traceable commits.
- **Stateless Resumption**: If the system crashes, it reads `STATE.md` and the `.continue-here.md` file to resume exactly at the correct Wave and Task ID.
- **Stub Detection**: The verifier specifically looks for "AI Slop" like `// TODO: Implement this` or empty catch blocks.
