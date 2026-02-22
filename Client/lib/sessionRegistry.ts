/**
 * Server-side registry: room code → session_id
 *
 * Uses a module-level Map that persists across requests on a single Node.js
 * process (pm2 on the VPS). Fine for single-instance deployment.
 */
const registry = new Map<string, string>();

export function registerSession(code: string, sessionId: string): void {
  registry.set(code.toUpperCase(), sessionId);
}

export function lookupSession(code: string): string | undefined {
  return registry.get(code.toUpperCase());
}
