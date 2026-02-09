# Deep Dive: oh-my-opencode-slim (High-Parallelism Orchestration)

## Core Philosophy: Fan-Out Engineering
"Slim" is built on the belief that a single LLM context is too fragile for complex engineering. Instead, it uses a **Main Orchestrator** to map the problem space and then "fans out" work to a swarm of specialized, parallel sub-agents.

## Granular Technical Strategies

### 1. The Pantheon Prompting Architecture
Each agent has a highly tuned system prompt:
- **Fixer**: Forbidden from doing research. It is a "stateless builder" that only sees the relevant files and a high-fidelity spec.
- **Oracle**: Uses "High-IQ" models. It is instructed to be a "Senior Architect" who reviews logic and design patterns before implementation begins.
- **Explorer**: Optimized for "Contextual Grep." It searches for patterns, not just strings, and returns structured "Territory Maps."

### 2. Repository Cartography & The "Atlas"
The `cartography` skill replaces blind searching with a stateful index:
- **MD5 Hash Tracking**: Detects changed folders. Only re-scans what has changed since the last session.
- **Hierarchical Codemaps**: Generates a `codemap.md` in every significant directory. These maps contain "Responsibilities" and "Integration Points."
- **The Atlas**: A root-level markdown file that acts as the agent's "Mental Model." It summarizes the entire repo so the agent doesn't have to `ls -R` every time it starts.

### 3. Tmux-Based Visibility
To solve the "Black Box" problem of parallel agents, Slim integrates with TMUX:
- Every background sub-agent session is spawned in a dedicated TMUX pane.
- The user can switch panes to watch the Fixer implement code or the Librarian read documentation in real-time.
- This provides a "War Room" vibe where multiple tasks are visibly moving forward simultaneously.

## Vibe Enhancements
- **Multi-Model Tiering**: Automatically routes tasks to the most cost-effective model (e.g., GPT-5 for Planning, Gemini Flash for Grepping).
- **Post-Read Nudge**: After any significant file read, the system injects a nudge: *"You have enough context. Delegate to a specialist now."* This prevents the main agent from getting bogged down in implementation.
