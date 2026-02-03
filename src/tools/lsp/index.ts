import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

// Types for LSP events (reverse engineered or from spec)
interface LspDiagnostic {
  uri: string;
  diagnostics: Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    severity: number; // 1: Error, 2: Warning, 3: Info, 4: Hint
    code?: string | number;
    source?: string;
    message: string;
  }>;
}

export class LspManager {
  private diagnostics: Map<string, LspDiagnostic["diagnostics"]> = new Map();

  // Handle incoming events
  public handleEvent(event: any) {
    if (event.type === "lsp.client.diagnostics") {
      const payload = event.payload as LspDiagnostic;
      // Normalizing URI to file path if needed (simplified)
      const path = payload.uri.replace("file://", "");
      this.diagnostics.set(path, payload.diagnostics);
    }
  }

  public getDiagnostics(path?: string): string {
    let output = "";

    if (path) {
      const diags = this.diagnostics.get(path);
      if (!diags || diags.length === 0) return "No diagnostics found.";
      output += this.formatDiagnostics(path, diags);
    } else {
      // All diagnostics
      for (const [p, diags] of this.diagnostics.entries()) {
        if (diags.length > 0) {
          output += this.formatDiagnostics(p, diags) + "\n";
        }
      }
    }

    return output || "No diagnostics found in any file.";
  }

  public getErrors(): string {
    let output = "";
    for (const [p, diags] of this.diagnostics.entries()) {
      const errors = diags.filter((d) => d.severity === 1);
      if (errors.length > 0) {
        output += this.formatDiagnostics(p, errors) + "\n";
      }
    }
    return output;
  }

  private formatDiagnostics(path: string, diags: LspDiagnostic["diagnostics"]): string {
    return (
      `File: ${path}\n` +
      diags
        .map(
          (d) =>
            `  [${d.severity === 1 ? "ERROR" : "WARNING"}] Line ${d.range.start.line + 1}: ${d.message} (${d.source})`,
        )
        .join("\n")
    );
  }
}

export function createLspTools(manager: LspManager) {
  return {
    lsp_diagnostics: tool({
      description: "Get current LSP diagnostics (errors/warnings) for files. Use this to verify your changes.",
      args: {
        path: tool.schema.string().optional().describe("Filter by specific file path"),
        onlyErrors: tool.schema.boolean().optional().describe("Only show errors (severity 1)"),
      },
      execute: async (args) => {
        if (args.onlyErrors) {
          const errors = manager.getErrors();
          return errors || "No errors found.";
        }
        return manager.getDiagnostics(args.path);
      },
    }),
  };
}
