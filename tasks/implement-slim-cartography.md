# Task: Implement Slim Cartography Engine

## Reference
- **Spec**: [Multi-Agent Orchestration (Slim Pantheon)](../specs.md#2-multi-agent-orchestration-slim-pantheon)
- **Detailed Spec**: [specs/slim-cartography-engine.md](../specs/slim-cartography-engine.md)

## Inspiration Sources
- **Cartographer Logic**: [inspo/oh-my-opencode-slim/src/features/cartography/skill.ts](../inspo/oh-my-opencode-slim/src/features/cartography/skill.ts)
  - *Key Logic*: Stateful mapping of files/folders and generation of the hierarchical Atlas.
- **Change Detection**: [inspo/oh-my-opencode-slim/src/features/cartography/cartographer.py](../inspo/oh-my-opencode-slim/src/features/cartography/cartographer.py)
  - *Key Logic*: MD5 hashing of directory contents to detect modifications.

## Implementation Steps
1. Build a `Cartographer` utility that creates an MD5 index of the repository.
2. Implement a sub-agent prompt for the `explorer` to generate `codemap.md` files for directories.
3. Create the `atlas_query` tool to search the generated index instead of raw `grep`.
