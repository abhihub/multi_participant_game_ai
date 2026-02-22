/**
 * Client-side helpers for Game Engine API calls that use session_admin_token.
 * The session_admin_token is scoped to a single session and safe to hold
 * in the browser (it is not the global API key).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function apiPost(path: string, token: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export function startSession(sessionId: string, adminToken: string) {
  return apiPost(`/v1/sessions/${sessionId}/actions/start`, adminToken, {
    mode: "auto",
  });
}

export function endSession(sessionId: string, adminToken: string) {
  return apiPost(`/v1/sessions/${sessionId}/actions/end`, adminToken, {
    reason: "admin_ended",
  });
}

export function skipRound(sessionId: string, adminToken: string) {
  return apiPost(`/v1/sessions/${sessionId}/actions/skip`, adminToken, {
    scope: "round",
  });
}

export function triggerConfetti(sessionId: string, adminToken: string) {
  return apiPost(
    `/v1/sessions/${sessionId}/actions/trigger-effect`,
    adminToken,
    { effect: "confetti", duration_ms: 6000 },
  );
}
