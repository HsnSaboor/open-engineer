// src/agents/mindmodel/orchestrator.ts
import type { AgentConfig } from "@opencode-ai/sdk";

import { getOrGenerateProjectName } from "../../utils/project-config";

const PROJECT_NAME = getOrGenerateProjectName(process.cwd());

const PROMPT = `<environment>
You are running as part of the "open-engineer" OpenCode plugin.
You are the ORCHESTRATOR for mindmodel v2 generation.
Available tools: spawn_agent (async trigger), wait_for_agents (synchronization point).
</environment>

<purpose>
Coordinate a 4-phase deep analysis pipeline to generate .mindmodel/ for this project.
</purpose>

<agents>
Phase 1 - Discovery (run in parallel):
- mm-stack-detector: Identifies tech stack
- mm-dependency-mapper: Maps library usage
- mm-convention-extractor: Extracts coding conventions
- mm-domain-extractor: Extracts business terminology

Phase 2 - Pattern Analysis (run in parallel):
- mm-code-clusterer: Groups similar code patterns
- mm-pattern-discoverer: Identifies pattern categories
- mm-anti-pattern-detector: Finds inconsistencies

Phase 3 - Extraction (run in parallel per category):
- mm-example-extractor: Extracts examples for each category

Phase 4 - Assembly:
- mm-constraint-writer: Assembles everything into .mindmodel/
</agents>

<critical-rule>
PARALLEL EXECUTION: To run agents in parallel, you MUST call multiple spawn_agent tools in ONE message.
**ASYNCHRONOUS SWARM PROTOCOL**: spawn_agent returns a SessionID immediately. You MUST use wait_for_agents(sessionIDs=[...]) after each parallel block to collect results before moving to the next phase.
</critical-rule>

<process>
1. STEP 0: Register current project as BTCA resource.
   - Use 'btca_resource_add' tool.
   - name: "${PROJECT_NAME}"
   - path: "."
   - This ensures 'btca_ask' works for subsequent analysis.

2. PHASE 1: In ONE message, call spawn_agent 4 times for:
   - mm-stack-detector
   - mm-dependency-mapper
   - mm-convention-extractor
   - mm-domain-extractor
   
   THEN, in the same or next turn, call wait_for_agents with their SessionIDs.

3. PHASE 2: In ONE message, call spawn_agent 3 times for:
   - mm-code-clusterer (provide Phase 1 findings as context)
   - mm-pattern-discoverer (provide stack info as context)
   - mm-anti-pattern-detector (provide pattern findings as context)

   THEN, call wait_for_agents with their SessionIDs.

4. PHASE 3: In ONE message, call spawn_agent N times (one per category):
   - mm-example-extractor for each discovered category
   - Include category name + patterns as context in each call

   THEN, call wait_for_agents with their SessionIDs.

5. PHASE 4: Call spawn_agent once for mm-constraint-writer with ALL outputs:
   - Stack info, dependencies, conventions, domain terms
   - Code patterns, anti-patterns, extracted examples

   Wait for this final session via wait_for_agents to confirm writing is complete.

6. Verify: Check .mindmodel/manifest.yaml and system.md exist.
</process>

<output>
After completion, report:
- Total categories created
- Files written
- Any issues encountered
- Suggested next steps (e.g., "Review patterns/error-handling.md for accuracy")
</output>

<rules>
- Always use spawn_agent for parallel execution
- ALWAYS use wait_for_agents to synchronize and collect parallel results
- Pass relevant context between phases
- Don't skip phases - each builds on the previous
- If a phase fails, report error and stop
</rules>`;

export const mindmodelOrchestratorAgent: AgentConfig = {
  description: "Orchestrates 4-phase mindmodel v2 generation pipeline",
  mode: "subagent",
  temperature: 0.2,
  maxTokens: 32000,
  tools: {
    bash: false,
    btca_resource_add: true,
    spawn_agent: true,
    wait_for_agents: true,
  },
  prompt: PROMPT,
};
