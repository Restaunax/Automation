/**
 * deployGuard.ts
 *
 * Supersede detection.
 *
 * The full suite runs after every push to `qa`, which Dokploy auto-deploys — so
 * a new deploy can restart the backend WHILE the suite is mid-run, producing a
 * wall of failures that have nothing to do with the code under test. We can't
 * stop that, but we can detect it: /monitoring/health reports process uptime,
 * from which we derive when the backend process started. Record it in
 * globalSetup, re-read in globalTeardown; if it moved, a deploy landed mid-run
 * and the run is "superseded" — recorded, not alerted, and excluded from the
 * pass-rate trend.
 */

interface HealthResponse {
  uptime?: number; // process uptime in seconds
  timestamp?: string; // server response time (ISO) — used to avoid clock skew
}

/**
 * Return the backend process start time in epoch ms, or null if unreachable.
 * Derived from the server's own timestamp minus uptime, so it doesn't depend on
 * the runner's clock being in sync with the server's.
 */
export async function readProcessStartedAt(
  backendUrl: string
): Promise<number | null> {
  try {
    const res = await fetch(`${backendUrl}/monitoring/health`, {
      // /monitoring/health is excluded from rate limiting; short timeout is fine.
      // It returns 200 (healthy/degraded) or 503 (unhealthy) — both carry a body.
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as HealthResponse;
    if (typeof body.uptime !== "number") return null;
    const serverNow = body.timestamp ? Date.parse(body.timestamp) : Date.now();
    if (Number.isNaN(serverNow)) return null;
    return Math.round(serverNow - body.uptime * 1000);
  } catch {
    return null;
  }
}

/**
 * True if the backend restarted between two readings (a deploy landed mid-run).
 * A 2s jitter tolerance absorbs uptime/timestamp rounding; a real restart moves
 * the start time by far more. Null readings (health briefly unreachable) are
 * treated as "not superseded" — a transient blip shouldn't discard a complete
 * run's results.
 */
export function wasSuperseded(
  before: number | null,
  after: number | null
): boolean {
  if (before == null || after == null) return false;
  return Math.abs(after - before) > 2000;
}
