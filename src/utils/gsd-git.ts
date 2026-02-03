import { spawn } from "bun";

export class GitAtomicManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private async exec(args: string[]): Promise<string> {
    const proc = spawn(args, {
      cwd: this.rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`Git command failed: ${args.join(" ")}\n${error}`);
    }

    return output.trim();
  }

  public async commitTask(phase: string, taskId: string, description: string) {
    // Stage all changes
    await this.exec(["git", "add", "."]);

    // Commit with formatted message
    // Format: feat(P{Phase}-T{TaskId}): {Description}
    const message = `feat(P${phase}-T${taskId}): ${description}`;
    await this.exec(["git", "commit", "-m", message]);

    return message;
  }

  public async verifyAndCommit(
    phase: string,
    taskId: string,
    description: string,
    verifyCmd: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Run verification command
      // We use 'bun' to run shell commands essentially, or direct execution
      // Simplest is to run via sh -c
      const verifyProc = spawn(["sh", "-c", verifyCmd], {
        cwd: this.rootDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      const verifyExit = await verifyProc.exited;
      const verifyOut = await new Response(verifyProc.stdout).text();
      const verifyErr = await new Response(verifyProc.stderr).text();

      if (verifyExit !== 0) {
        return {
          success: false,
          message: `Verification failed:\n${verifyOut}\n${verifyErr}`,
        };
      }

      // If success, commit
      const commitMsg = await this.commitTask(phase, taskId, description);
      return { success: true, message: `Verified and committed: ${commitMsg}` };
    } catch (e) {
      return { success: false, message: `System error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
