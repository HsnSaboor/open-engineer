# Report: OpenCode Dynamic Context Pruning (DCP) Analysis

## Overview
OpenCode DCP is a context management plugin designed to optimize token usage and prevent context poisoning in long-running agentic sessions. It transforms the conversation history from a static log into a dynamic, managed knowledge base.

## Key Features & Innovations
1. **Dynamic Pruning**: Replaces bulky tool outputs with concise placeholders (e.g., `[Output removed]`) just before sending the request to the LLM.
2. **Zero-Cost Strategies**:
   - **Deduplication**: Automatically prunes repeated `ls`, `grep`, or `read` calls.
   - **Supersede Writes**: Prunes the input of a `write` tool if the file is subsequently `read`.
   - **Purge Errors**: Removes large input blocks from failed tool calls after a few turns.
3. **AI-Managed Memory**:
   - **`discard` Tool**: Allows the AI to explicitly mark information as noise.
   - **`extract` Tool**: Allows the AI to summarize a tool's output into a concise signal before the raw data is pruned.

## Comparison with Open Engineer
| Feature | Open Engineer | OpenCode DCP |
| :--- | :--- | :--- |
| **Context Growth** | Linear (accumulates everything) | Elastic (prunes redundancies) |
| **Tool Output Management** | Persistent in history | Replaceable with placeholders |
| **Information Density** | Low (lots of raw data) | High (distilled via `extract`) |
| **Performance** | Degrades as session grows | Stays sharp via pruning |

## What it does better than Open Engineer
- **Token Efficiency**: DCP significantly reduces the "cost per turn" in long sessions.
- **Context Clarity**: By removing "noise" (failed attempts, repeated reads), it reduces the chance of model hallucination.
- **Session Longevity**: Allows for much more complex tasks that would normally exceed the context window.

## Recommendations for Open Engineer
- Implement a **Deduplication Strategy** for read-only tools.
- Add an **`extract` tool** to allow the agent to summarize large file reads or search results.
- Implement **Placeholder Injection** to keep the context window focused on the current task.
