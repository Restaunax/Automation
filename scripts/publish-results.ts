/**
 * publish-results.ts
 *
 * Runs AFTER the Playwright suite in CI (step is `if: always()`). Reads the JSON
 * reporter output, flattens it to per-test rows, detects a mid-run deploy
 * (superseded), and POSTs a run summary + rows to the backend ingest endpoint
 * (POST /monitoring/e2e-results) which stores them for the Grafana dashboard.
 *
 * Best-effort telemetry: it never fails the CI job. The test step already
 * reflects pass/fail; a publish hiccup should not turn the board red.
 *
 * Env:
 *   RESULTS_URL      ingest endpoint (e.g. https://api.restaunax.com/monitoring/e2e-results)
 *   RESULTS_API_KEY  x-api-key for the endpoint (= prod METRICS_API_KEY)
 *   E2E_TRIGGER      qa-deploy | nightly | manual | prod-gate (default "manual")
 *   GITHUB_* (Actions-provided): RUN_ID, RUN_NUMBER, SHA, REF_NAME, REPOSITORY, SERVER_URL
 */

import * as fs from "fs";
import * as path from "path";

import { BACKEND_URL } from "../utils/apiHelper";
import { readProcessStartedAt, wasSuperseded } from "../utils/deployGuard";
import { STATE_FILE } from "../utils/testData";

const RESULTS_PATH = path.resolve(__dirname, "..", "results.json");

// ── Playwright JSON reporter shape (only the fields we read) ─────────────────
interface PwResult {
  status?: string; // passed | failed | skipped | timedOut | interrupted
  duration?: number;
  retry?: number;
  errors?: { message?: string }[];
}
interface PwTest {
  projectName?: string;
  status?: string; // expected | unexpected | flaky | skipped
  results?: PwResult[];
}
interface PwSpec {
  title?: string;
  file?: string;
  tests?: PwTest[];
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  stats?: {
    startTime?: string;
    duration?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  suites?: PwSuite[];
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const stripAnsi = (s: string): string => s.replace(ANSI, "");

/**
 * Alert Slack on a genuine failure only — never on a passing run, and never on
 * a run superseded by a mid-run deploy (those failures aren't real). Doing this
 * here (rather than a workflow `if: failure()` step) is what lets us exclude
 * superseded runs, since only this script knows the computed status.
 */
async function notifySlack(
  status: string,
  counts: { total: number; failed: number; flaky: number },
  ghRunUrl: string | null
): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook || status !== "failed") return;
  const text =
    `:rotating_light: QA E2E *failed* — ${counts.failed}/${counts.total} failed` +
    (counts.flaky ? `, ${counts.flaky} flaky` : "") +
    (ghRunUrl ? `\n${ghRunUrl}` : "");
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn("[publish-results] Slack notify failed (ignoring):", e);
  }
}

/** Recursively collect every spec across the suite tree. */
function collectSpecs(suites: PwSuite[]): PwSpec[] {
  const out: PwSpec[] = [];
  for (const s of suites) {
    if (s.specs) out.push(...s.specs);
    if (s.suites) out.push(...collectSpecs(s.suites));
  }
  return out;
}

/** Map Playwright's per-test outcome to our row status. */
function rowStatus(test: PwTest): "passed" | "failed" | "skipped" | "flaky" {
  switch (test.status) {
    case "expected":
      return "passed";
    case "flaky":
      return "flaky";
    case "skipped":
      return "skipped";
    default:
      return "failed"; // unexpected / interrupted / anything else
  }
}

async function main(): Promise<void> {
  const RESULTS_URL = process.env.RESULTS_URL;
  const RESULTS_API_KEY = process.env.RESULTS_API_KEY;
  if (!RESULTS_URL || !RESULTS_API_KEY) {
    console.warn(
      "[publish-results] RESULTS_URL / RESULTS_API_KEY not set — skipping publish."
    );
    return;
  }

  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(
      `[publish-results] ${RESULTS_PATH} not found (did the suite produce a JSON report?) — skipping.`
    );
    return;
  }

  const report = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8")) as PwReport;
  const stats = report.stats ?? {};

  // Per-test rows.
  const specs = collectSpecs(report.suites ?? []);
  const results = specs.flatMap((spec) =>
    (spec.tests ?? []).map((test) => {
      const status = rowStatus(test);
      const attempts = test.results ?? [];
      const durationMs = Math.round(
        attempts.reduce((sum, r) => sum + (r.duration ?? 0), 0)
      );
      const retries = attempts.length > 0 ? attempts.length - 1 : 0;
      const errorMessage =
        attempts
          .flatMap((r) => r.errors ?? [])
          .map((e) => (e.message ? stripAnsi(e.message) : ""))
          .find((m) => m.length > 0) ?? null;
      const tcId = spec.title?.match(/\bTC-\d+\b/)?.[0] ?? null;
      return {
        project: test.projectName ?? "unknown",
        specFile: spec.file ?? "unknown",
        testTitle: spec.title ?? "unknown",
        tcId,
        status,
        durationMs,
        retries,
        errorMessage: errorMessage ? errorMessage.slice(0, 4000) : null,
      };
    })
  );

  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  const total = passed + failed + flaky + skipped;

  // Superseded? Compare the process start recorded at setup with now. A deploy
  // that restarted the backend mid-run invalidates the failures.
  let supersededByDeploy = false;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as {
        processStartedAt?: number | null;
      };
      const before = state.processStartedAt ?? null;
      const after = await readProcessStartedAt(BACKEND_URL);
      supersededByDeploy = wasSuperseded(before, after);
    }
  } catch (e) {
    console.warn("[publish-results] supersede check failed (ignoring):", e);
  }

  const runStatus = supersededByDeploy
    ? "superseded"
    : failed > 0
      ? "failed"
      : "passed";

  const startedAt = stats.startTime ?? new Date().toISOString();
  const durationMs = Math.round(stats.duration ?? 0);
  const finishedAt = new Date(Date.parse(startedAt) + durationMs).toISOString();

  const runId = process.env.GITHUB_RUN_ID;
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY ?? "Restaunax/Automation";
  const ghRunUrl = runId ? `${server}/${repo}/actions/runs/${runId}` : null;

  const payload = {
    run: {
      startedAt,
      finishedAt,
      durationMs,
      trigger: process.env.E2E_TRIGGER ?? "manual",
      environment: "qa",
      commitSha: process.env.GITHUB_SHA ?? null,
      branch: process.env.GITHUB_REF_NAME ?? null,
      status: runStatus,
      total,
      passed,
      failed,
      skipped,
      flaky,
      ghRunUrl,
      allureUrl: null,
    },
    results,
  };

  try {
    const res = await fetch(RESULTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": RESULTS_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(
        `[publish-results] ingest returned ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
    } else {
      console.log(
        `[publish-results] published run status=${runStatus} ` +
          `total=${total} passed=${passed} failed=${failed} flaky=${flaky} ` +
          `skipped=${skipped} rows=${results.length}`
      );
    }
  } catch (e) {
    console.warn("[publish-results] POST failed (ignoring):", e);
  }

  // Alert independently of the ingest result — a failing suite should reach
  // Slack even if the DB write hiccuped.
  await notifySlack(runStatus, { total, failed, flaky }, ghRunUrl);
}

// Never fail the CI job on a telemetry error.
main().catch((e) => {
  console.warn("[publish-results] unexpected error (ignoring):", e);
});
