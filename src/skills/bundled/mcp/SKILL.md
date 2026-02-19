---
name: mcp
description: "Model Context Protocol (MCP) server development and tool management. Languages: Python, TypeScript. Capabilities: build MCP servers, integrate external APIs, discover/execute MCP tools, manage multi-server configs, design agent-centric tools, create evaluations. Actions: create, build, integrate, discover, execute, configure MCP servers/tools. Keywords: MCP, Model Context Protocol, MCP server, MCP tool, stdio transport, SSE transport, HTTP transport, tool discovery, resource provider, prompt template, external API integration, Gemini CLI MCP, Claude MCP, agent tools, tool execution, server config, FastMCP, Zod, Pydantic. Use when: building MCP servers, integrating external APIs as MCP tools, discovering available MCP tools, executing MCP capabilities, configuring multi-server setups, designing tools for AI agents, creating evaluations."
license: Complete terms in LICENSE.txt
---

# MCP: Build & Manage Protocol Servers

Build MCP servers that integrate APIs, and execute tools from configured servers.

## When to Use

**Building**: Create MCP servers (Python/TypeScript), integrate APIs, design agent-centric tools, implement validation/error handling, create evaluations

**Managing**: Discover/execute tools via Gemini CLI, filter tools for tasks, manage multi-server configs

## Core Concepts

MCP = standardized protocol for AI agents to access external tools/data.

**Components**: Tools (executable functions), Resources (read-only data), Prompts (templates)
**Transports**: Stdio (local), HTTP/Streamable HTTP (remote), SSE (real-time)

---

## Part 1: Building MCP Servers

Build high-quality MCP servers that enable LLMs to accomplish real-world tasks. The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks.

### Development Workflow

#### Phase 1: Deep Research and Planning

**1.1 Understand Agent-Centric Design:**

- **API Coverage vs. Workflow Tools:** Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools can be more convenient for specific tasks, while comprehensive coverage gives agents flexibility to compose operations. When uncertain, prioritize comprehensive API coverage.
- **Tool Naming and Discoverability:** Use service-prefixed names (`slack_send_message`, not `send_message`). Clear, descriptive, action-oriented naming with consistent prefixes.
- **Context Management:** Agents benefit from concise tool descriptions and the ability to filter/paginate results. Design tools that return focused, relevant data.
- **Actionable Error Messages:** Error messages should guide agents toward solutions with specific suggestions and next steps.

**1.2 Study MCP Protocol Documentation:**

Start with the sitemap: `https://modelcontextprotocol.io/sitemap.xml`
Fetch specific pages with `.md` suffix (e.g., `https://modelcontextprotocol.io/specification/draft.md`).

Key pages to review:
- Specification overview and architecture
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions

**1.3 Study Framework Documentation:**

**Recommended stack:**
- **Language**: TypeScript (high-quality SDK support, good compatibility, static typing, good linting)
- **Transport**: Streamable HTTP for remote servers (stateless JSON), stdio for local servers

**Load framework documentation:**
- **MCP Best Practices**: `references/best-practices.md` / `reference/mcp_best_practices.md`
- **Python SDK**: Fetch from `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- **TypeScript SDK**: Fetch from `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- **Python Guide**: `references/python-guide.md` / `reference/python_mcp_server.md`
- **TypeScript Guide**: `references/typescript-guide.md` / `reference/node_mcp_server.md`

**1.4 Plan Your Implementation:**
- Review the service's API documentation exhaustively
- Identify key endpoints, authentication requirements, data models
- Prioritize comprehensive API coverage, list endpoints to implement
- Plan tool selection, shared utilities, input/output design, error handling

#### Phase 2: Implementation

**2.1 Set Up Project Structure:**
- Single file for Python, full structure for TypeScript
- See language-specific guides for project setup

**2.2 Implement Core Infrastructure:**
- API client with authentication
- Error handling helpers
- Response formatting (JSON/Markdown)
- Pagination support

**2.3 Implement Tools:**

For each tool:

**Input Schema:**
- Use Zod (TypeScript) or Pydantic (Python)
- Include constraints and clear descriptions
- Add examples in field descriptions

**Output Schema:**
- Define `outputSchema` where possible for structured data
- Use `structuredContent` in tool responses (TypeScript SDK feature)

**Tool Description:**
- Concise summary of functionality
- Parameter descriptions
- Return type schema

**Implementation:**
- Async/await for all I/O operations
- Proper error handling with actionable messages
- Support pagination with `limit`, `offset`, `has_more`
- Set CHARACTER_LIMIT constant (typically 25,000)
- Return both text content and structured data when using modern SDKs

**Annotations:**
- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false
- `openWorldHint`: true/false

#### Phase 3: Review and Test

**3.1 Code Quality:**
- No duplicated code (DRY principle)
- Consistent error handling
- Full type coverage
- Clear tool descriptions
- Extract common functionality into reusable functions
- Comprehensive docstrings with explicit schemas

**3.2 Build and Test:**

**TypeScript:**
- Run `npm run build` to verify compilation
- Test with MCP Inspector: `npx @modelcontextprotocol/inspector`

**Python:**
- Verify syntax: `python -m py_compile your_server.py`
- Test with MCP Inspector

#### Phase 4: Create Evaluations

After implementing, create comprehensive evaluations to test effectiveness.

**4.1 Evaluation Purpose:** Test whether LLMs can effectively use your MCP server to answer realistic, complex questions.

**4.2 Create 10 Evaluation Questions:**

1. **Tool Inspection**: List available tools and understand their capabilities
2. **Content Exploration**: Use READ-ONLY operations to explore available data
3. **Question Generation**: Create 10 complex, realistic questions
4. **Answer Verification**: Solve each question yourself to verify answers

**4.3 Evaluation Requirements:**

Each question must be:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases humans would care about
- **Verifiable**: Single, clear answer verifiable by string comparison
- **Stable**: Answer won't change over time

**4.4 Output Format:**

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
```

---

## Part 2: Using MCP Tools

Execute and manage tools from configured MCP servers efficiently.

### Configuration

MCP servers configured in `.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {"API_KEY": "${ENV_VAR}"}
    }
  }
}
```

**Gemini CLI Integration**: Create symlink for shared config:
```bash
mkdir -p .gemini && ln -sf .claude/.mcp.json .gemini/settings.json
```

### Execution Methods (Priority Order)

**1. Gemini CLI (Primary)**

Automatic tool discovery and execution via natural language.

```bash
# CRITICAL: Use stdin piping, NOT -p flag (deprecated, skips MCP init)
echo "Take a screenshot of https://example.com" | gemini -y -m gemini-2.5-flash
```

**Benefits**:
- Automatic tool discovery and selection
- Structured JSON responses (if `GEMINI.md` configured)
- Fastest execution
- No manual tool specification needed

**GEMINI.md Response Format**: Place in project root to enforce JSON-only responses:
```markdown
# Gemini CLI Instructions
Always respond in this exact JSON format:
{"server":"name","tool":"name","success":true,"result":<data>,"error":null}
Maximum 500 characters. No markdown, no explanations.
```

**2. Direct CLI Scripts (Secondary)**

Manual tool specification when you know exact server/tool needed:

```bash
npx tsx scripts/cli.ts call-tool memory create_entities '{"entities":[...]}'
```

**3. mcp-manager Subagent (Fallback)**

Delegate to subagent when Gemini unavailable or for complex multi-tool workflows.

### Tool Discovery

List available tools to understand capabilities:

```bash
# Saves to assets/tools.json for offline reference
npx tsx scripts/cli.ts list-tools

# List prompts and resources
npx tsx scripts/cli.ts list-prompts
npx tsx scripts/cli.ts list-resources
```

**Intelligent Selection**: LLM reads `assets/tools.json` directly for context-aware tool filtering (better than keyword matching).

---

## Quick Start Examples

### Building a Server

**Python**:
```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

mcp = FastMCP("github_mcp")

class SearchInput(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=100)

@mcp.tool(name="github_search_repos", annotations={"readOnlyHint": True})
async def search_repos(params: SearchInput) -> str:
    # Implementation
    pass

if __name__ == "__main__":
    mcp.run()
```

**TypeScript**:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({name: "github-mcp-server", version: "1.0.0"});

const SearchSchema = z.object({
  query: z.string().min(2).max(200),
  limit: z.number().int().min(1).max(100).default(20)
}).strict();

server.registerTool("github_search_repos", {
  description: "Search GitHub repositories",
  inputSchema: SearchSchema,
  annotations: {readOnlyHint: true}
}, async (params) => {
  // Implementation
});
```

### Using Tools

**Gemini CLI**:
```bash
# IMPORTANT: Use stdin piping, NOT -p flag
echo "Search GitHub for MCP servers and summarize top 3" | gemini -y -m gemini-2.5-flash
```

**Direct Script**:
```bash
npx tsx scripts/cli.ts call-tool github search_repos '{"query":"mcp","limit":3}'
```

---

## Reference Files

Load these as needed during your work:

### Core References
- **`references/building-servers.md`** / **`reference/mcp_best_practices.md`** - Complete MCP server development guide
  - Agent-centric design principles
  - Tool patterns, response formats, pagination, error handling
  - Complete examples and quality checklists
  - Evaluation creation methodology

- **`references/using-tools.md`** - Complete MCP tool execution guide
  - Gemini CLI integration and configuration
  - Direct script execution patterns
  - Subagent delegation strategies
  - Tool discovery and filtering
  - Multi-server orchestration

- **`references/best-practices.md`** - Universal MCP guidelines
  - Server and tool naming conventions
  - Response format standards (JSON vs Markdown)
  - Pagination, character limits, truncation
  - Security and privacy considerations
  - Testing and compliance requirements

### Language-Specific Guides
- **`references/python-guide.md`** / **`reference/python_mcp_server.md`** - Python/FastMCP specifics (Pydantic models, async patterns, server initialization, complete working examples, quality checklist)
- **`references/typescript-guide.md`** / **`reference/node_mcp_server.md`** - TypeScript/Zod specifics (strict types, project structure, tool registration, complete working examples, quality checklist)

### Supporting References
- **`references/protocol-basics.md`** - JSON-RPC protocol details
- **`references/evaluation-guide.md`** / **`reference/evaluation.md`** - Creating effective MCP server evaluations

### SDK Documentation (Online)
- **Python SDK**: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- **TypeScript SDK**: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- **MCP Protocol**: `https://modelcontextprotocol.io/sitemap.xml`

---

## Progressive Disclosure

This SKILL.md provides high-level overview. Load reference files when:

**Building Servers**:
- Starting implementation → Load building-servers reference
- Need language-specific details → Load python-guide or typescript-guide
- Creating evaluations → Load evaluation-guide

**Using Tools**:
- Setting up Gemini CLI → Load using-tools reference
- Debugging tool execution → Load using-tools reference
- Multi-server configuration → Load using-tools reference

**Best Practices**:
- Reviewing standards → Load best-practices reference
- Security considerations → Load best-practices reference

---

## Integration Patterns

**Build + Use**: Create MCP server, then test with Gemini CLI
**Multi-Server**: Configure multiple servers, orchestrate via Gemini CLI
**Evaluation-Driven**: Build server, create evaluations, iterate based on LLM feedback

---

## Boundaries

**Will**:
- Guide MCP server development in Python or TypeScript
- Provide tool execution strategies via Gemini CLI or scripts
- Ensure best practices for agent-centric design
- Help create effective evaluations
- Configure multi-server setups

**Will Not**:
- Run long-running server processes in main thread (use tmux or evaluation harness)
- Skip input validation or error handling
- Create tools without comprehensive documentation
- Build servers without considering agent context limits
