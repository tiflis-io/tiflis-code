/**
 * @file agent-matcher.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

export function findAgentMatch(
  userInput: string,
  availableAgents: string[]
): string | null {
  const normalized = userInput.toLowerCase().trim();

  const exactMatch = availableAgents.find(
    agent => agent.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  const substringMatch = availableAgents.find(
    agent => normalized.includes(agent.toLowerCase())
  );
  if (substringMatch) return substringMatch;

  const partialMatch = availableAgents.find(
    agent => agent.toLowerCase().includes(normalized)
  );
  if (partialMatch) return partialMatch;

  return null;
}
