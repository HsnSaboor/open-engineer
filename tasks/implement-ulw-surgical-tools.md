# Task: Implement Surgical Refactoring Tools

## Reference
- **Spec**: [Autonomous "Ultrawork" Enforcers (OhMy)](../specs.md#4-autonomous-ultrawork-enforcers-ohmy)
- **Detailed Spec**: [specs/ulw-surgical-refactoring-tools.md](../specs/ulw-surgical-refactoring-tools.md)

## Inspiration Sources
- **AST-Grep Implementation**: [inspo/oh-my-opencode/src/tools/ast-grep/tools.ts](../inspo/oh-my-opencode/src/tools/ast-grep/tools.ts)
  - *Key Logic*: Wrapper for the `sg` (ast-grep) CLI, allowing structural find-and-replace using patterns.
- **LSP Diagnostics Gate**: [inspo/oh-my-opencode/src/hooks/slop-checker.ts](../inspo/oh-my-opencode/src/hooks/slop-checker.ts) (Example of a post-write quality gate).

## Implementation Steps
1. Implement the `ast_grep_replace` tool in `src/tools/ast-grep/`.
2. Integrate a basic LSP client to support `lsp_diagnostics` and `lsp_rename`.
3. Create a quality gate hook that prevents task completion if `lsp_diagnostics` returns errors.
