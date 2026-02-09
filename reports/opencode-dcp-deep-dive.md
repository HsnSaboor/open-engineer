# Deep Dive: OpenCode Dynamic Context Pruning (DCP)

## Core Philosophy: The Managed Knowledge Base
OpenCode DCP rejects the traditional "infinite chat log" model. It treats the context window as a finite, high-cost resource that must be actively curated. It operates on a **Lazy-Pruning** principle: history is kept intact for the user, but "poisonous" or redundant data is scrubbed just-in-time before LLM dispatch.

## Granular Technical Strategies

### 1. Zero-Cost Structural Pruning
These strategies require no LLM calls and run instantly on every request:
- **Chronological Supersede Writes**: Tracks the state of files. If a `write` call is followed by a `read`, the input of the `write` call (which can be thousands of lines) is replaced with a placeholder. The reasoning: the `read` result is the "ground truth" the model needs.
- **Deduplication Engine**: Uses a hash-map of `(tool_name, parameters)`. If the exact same call is repeated (common with `ls` or `grep` in loops), all but the most recent result are pruned.
- **Fail-Fast Purging**: Tool calls with `status: "error"` are pruned after 4 message turns. This prevents the LLM from repeatedly analyzing a massive stack trace or failed build log that it has already acknowledged.

### 2. Semantic Distillation (The `extract` Tool)
Unlike standard agents that just "read and remember," DCP allows the agent to **externalize its memory**:
- The agent calls `extract(id: number, summary: string)`.
- The system replaces the raw tool output at `id` with `summary`.
- **Impact**: This allows an agent to read a 2,000-line documentation file, extract the 3 relevant API signatures, and then effectively "delete" the rest of the file from its active attention span.

### 3. Context Injection & Numeric Mapping
DCP injects a hidden system block: `<prunable-tools>`. It maps numeric IDs to specific tool outputs in the history.
- **Format**: `ID: [TOOL] [PARAMS] [SUMMARY?]`
- This allows the agent to strategically manage its own context window without needing to re-read the entire history to find what to prune.

## Vibe Enhancements
- **Silent Operation**: Pruning happens behind the scenes. The LLM is instructed NEVER to mention pruning in its output, maintaining the illusion of a focused, high-speed engineer.
- **Turn Protection**: A configurable buffer (default: 2 turns) prevents the system from pruning the *very latest* outputs, giving the LLM time to process them before they are eligible for optimization.
