export const BUILTIN_AGENTS = new Set(["build", "plan", "general", "explore", "compaction", "title", "summary"]);

const sessionAgents = new Map<string, string>();
const MAX_SESSIONS = 1000;

function enforceBounds(): void {
  if (sessionAgents.size > MAX_SESSIONS) {
    const entries = Array.from(sessionAgents.keys());
    for (let i = 0; i < entries.length - MAX_SESSIONS; i++) {
      sessionAgents.delete(entries[i]);
    }
  }
}

export function setSessionAgent(sessionID: string, agent: string): void {
  sessionAgents.set(sessionID, agent);
  enforceBounds();
}

export function getSessionAgent(sessionID: string): string | undefined {
  return sessionAgents.get(sessionID);
}

export function isBuiltinAgent(agent: string | undefined): boolean {
  if (!agent) return false;
  return BUILTIN_AGENTS.has(agent);
}

export function isSessionBuiltin(sessionID: string): boolean {
  const agent = sessionAgents.get(sessionID);
  return isBuiltinAgent(agent);
}

export function cleanupSession(sessionID: string): void {
  sessionAgents.delete(sessionID);
}
