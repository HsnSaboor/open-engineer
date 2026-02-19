export const BUILTIN_AGENTS = new Set(["build", "plan", "general", "explore", "compaction", "title", "summary"]);

const sessionAgents = new Map<string, string>();
const MAX_SESSIONS = 1000;

function enforceBounds(): void {
  if (sessionAgents.size > MAX_SESSIONS) {
    // LRU eviction: find sessions that are NOT builtin and evict oldest non-builtin first.
    // This preserves parent/commander sessions (which are typically builtin or long-lived).
    const entries = Array.from(sessionAgents.entries());
    const nonBuiltin = entries.filter(([, agent]) => !BUILTIN_AGENTS.has(agent));
    const toEvict = nonBuiltin.length > 0 ? nonBuiltin : entries;

    // Evict oldest entries (first in Map insertion order) from the chosen pool
    const evictCount = sessionAgents.size - MAX_SESSIONS;
    for (let i = 0; i < Math.min(evictCount, toEvict.length); i++) {
      sessionAgents.delete(toEvict[i][0]);
    }
  }
}

export function setSessionAgent(sessionID: string, agent: string): void {
  // Delete and re-insert to move to end (most recently used)
  sessionAgents.delete(sessionID);
  sessionAgents.set(sessionID, agent);
  enforceBounds();
}

export function getSessionAgent(sessionID: string): string | undefined {
  const agent = sessionAgents.get(sessionID);
  if (agent !== undefined) {
    // Touch: move to end for LRU
    sessionAgents.delete(sessionID);
    sessionAgents.set(sessionID, agent);
  }
  return agent;
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
