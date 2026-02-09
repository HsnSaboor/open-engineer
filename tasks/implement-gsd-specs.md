# Task: Implement GSD Spec-Driven Workflow

## Reference
- **Spec**: [Spec-Driven Development (GSD)](../specs.md#3-spec-driven-development-gsd)
- **Detailed Spec**: [specs/gsd-spec-stack-schema.md](../specs/gsd-spec-stack-schema.md)

## Inspiration Sources
- **Planning Template**: [inspo/get-shit-done/README.md:242](../inspo/get-shit-done/README.md)
  - *Key Logic*: Documentation of the `PLAN.md` structure and its role in the atomic execution lifecycle.
- **GSD Planner Agent**: [inspo/get-shit-done/agents/gsd-planner.md](../inspo/get-shit-done/agents/gsd-planner.md)
  - *Key Logic*: The internal logic of how to break a Roadmap Phase into atomic, XML-tagged tasks.

## Implementation Steps
1. Create a `SpecManager` utility to handle reading/writing `PROJECT.md`, `REQUIREMENTS.md`, and `ROADMAP.md`.
2. Update the `Planner` agent prompt to output plans in the XML-structured format.
3. Implement a `discuss-phase` workflow to gather implementation context before code generation.
