import type { PluginInput } from "@opencode-ai/plugin";

import type { SkillLoader } from "../skills/loader";
import { log } from "../utils/logger";

// Patterns that indicate prompt injection attempts in skill content
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /you\s+are\s+now\s+in\s+maintenance\s+mode/i,
  /system\s+prompt\s+override/i,
  /\bexfiltrate?\b/i,
  /curl\s+.*\$\(.*\)/i,
  /base64.*id_rsa/i,
  /\bsudo\b.*\brm\b/i,
  /\beval\s*\(/i,
  /<\/?system>/i,
];

const MAX_SKILL_CONTENT_LENGTH = 15000; // ~4K tokens max per skill
const MAX_SKILLS_PER_SESSION = 3;

function sanitizeSkillContent(content: string, skillName: string): string | null {
  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      log.warn("skills", `Blocked skill "${skillName}": matched injection pattern ${pattern}`);
      return null;
    }
  }

  // Truncate overly long skills
  if (content.length > MAX_SKILL_CONTENT_LENGTH) {
    log.warn("skills", `Truncating skill "${skillName}": ${content.length} chars exceeds limit`);
    return content.slice(0, MAX_SKILL_CONTENT_LENGTH) + "\n\n[... truncated for context budget]";
  }

  return content;
}

export function createSkillInjectorHook(_ctx: PluginInput, skills: SkillLoader) {
  const sessionSkills = new Map<string, Set<string>>();
  // Track whether we already matched for a given session to avoid re-matching on every message
  const sessionMatched = new Set<string>();

  return {
    "experimental.chat.system.transform": async (
      input: { sessionID?: string; model?: unknown },
      output: { system: string[] },
    ) => {
      if (!input.sessionID) return;

      const activeSkills = sessionSkills.get(input.sessionID);
      if (!activeSkills || activeSkills.size === 0) return;

      output.system = output.system || [];

      for (const skillName of activeSkills) {
        const rawContent = skills.getContent(skillName);
        if (!rawContent) continue;

        const safeContent = sanitizeSkillContent(rawContent, skillName);
        if (!safeContent) continue;

        output.system.push(
          `<skill name="${skillName}" source="community" trust="unverified">`,
          safeContent,
          `</skill>`,
        );
      }

      log.debug("skills", `Injected ${activeSkills.size} skill(s)`, { sessionID: input.sessionID });
    },

    "chat.message": async (
      input: { sessionID: string; agent?: string },
      output: { parts: Array<{ type: string; text?: string }> },
    ) => {
      if (!input.sessionID || !input.agent) return;

      // Only match on the FIRST user message per session, not on every message
      if (sessionMatched.has(input.sessionID)) return;

      const text =
        output.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join(" ") ?? "";

      if (text.length < 10) return;

      // Mark as matched so we don't re-run on subsequent messages
      sessionMatched.add(input.sessionID);

      try {
        const matches = await skills.matchWithThreshold(text);
        if (matches.length > 0) {
          const skillSet = sessionSkills.get(input.sessionID) ?? new Set<string>();

          for (const match of matches.slice(0, MAX_SKILLS_PER_SESSION)) {
            if (match?.skillName) {
              skillSet.add(match.skillName);
              log.info("skills", `Auto-activated skill: ${match.skillName}`, {
                sessionID: input.sessionID,
                score: match.score,
                reason: match.reason,
              });
            }
          }

          if (skillSet.size > 0) {
            sessionSkills.set(input.sessionID, skillSet);
          }
        }
      } catch (err) {
        log.warn("skills", "Skill matching failed", { error: String(err) });
      }
    },

    "tool.execute.before": async (input: { sessionID: string; tool: string }) => {
      if (!input.sessionID) return;

      const activeSkills = sessionSkills.get(input.sessionID);
      if (!activeSkills || activeSkills.size === 0) return;

      let isUnrestricted = false;
      const allowedTools = new Set<string>();

      for (const skillName of activeSkills) {
        const skill = skills.get(skillName);
        // If a skill doesn't specify allowedTools (undefined), assume it allows everything.
        // If it specifies an empty array [], it means NO tools are allowed.
        if (!skill?.meta.allowedTools) {
          isUnrestricted = true;
          break;
        }
        for (const t of skill.meta.allowedTools) {
          allowedTools.add(t);
        }
      }

      // If any skill is unrestricted, allow everything
      if (isUnrestricted) return;

      // Otherwise, enforce the union of allowed tools
      if (!allowedTools.has(input.tool)) {
        throw new Error(
          `Tool "${input.tool}" is not allowed by active skills. Allowed: [${Array.from(allowedTools).join(", ")}]`,
        );
      }
    },

    cleanup(sessionID: string) {
      sessionSkills.delete(sessionID);
      sessionMatched.delete(sessionID);
    },
  };
}

export type SkillInjectorHook = ReturnType<typeof createSkillInjectorHook>;
