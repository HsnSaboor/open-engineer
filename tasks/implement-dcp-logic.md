# Task: Implement DCP Pruning Logic

## Reference
- **Spec**: [Context Engineering & Optimization (DCP)](../specs.md#1-context-engineering--optimization-dcp)
- **Detailed Spec**: [specs/dcp-strategy-logic.md](../specs/dcp-strategy-logic.md)

## Inspiration Sources
- **Deduplication Logic**: [inspo/opencode-dcp/lib/strategies/deduplication.ts:19](../inspo/opencode-dcp/lib/strategies/deduplication.ts)
  - *Key Logic*: Uses `config.strategies.deduplication.enabled` to toggle a filter that hashes tool parameters and marks older duplicates as pruned.
- **Supersede Writes Logic**: [inspo/opencode-dcp/lib/strategies/supersede-writes.ts:16](../inspo/opencode-dcp/lib/strategies/supersede-writes.ts)
  - *Key Logic*: `supersedeWrites` function tracks file write events and nukes their input context once a subsequent read occurs.

## Implementation Steps
1. Create a `PruningManager` class in `src/utils/context-pruning.ts`.
2. Implement the `deduplicate` method using a parameter-hashing approach.
3. Implement `supersedeWrites` by tracking file paths in a `Map<string, callId>`.
4. Integrate into the main dispatch loop before the LLM request is sent.
