/**
 * The QA simulator's daily summary (.github/workflows/sim-daily.yml, 13:00
 * UTC, an hour after the backend's 12:00 self-check). For every simulator
 * restaurant it reads the self-check and the latest days of runs through the
 * admin API, writes the GitHub job summary, posts one Slack message, and
 * exits 1 when something needs a person, so GitHub emails too:
 *
 * - a check went WRONG since the last summary (first seen < 25 h ago),
 * - yesterday's run is missing, FAILED or PARTIAL,
 * - the self-check hasn't finished in the last 26 hours.
 *
 * Older WRONG items and WAITING ones are listed, never failing the run: they
 * were reported on the day they appeared.
 *
 * Needs ADMIN_EMAIL / ADMIN_PASSWORD; BACKEND_URL defaults to QA;
 * SLACK_WEBHOOK_URL and GITHUB_STEP_SUMMARY are used when set.
 * Run locally: npx tsx scripts/sim-daily-summary.ts
 */
import { appendFileSync } from "node:fs";

const API = process.env.BACKEND_URL || "https://api.qa.restaunax.com";
const DASHBOARD = process.env.FRONTEND_URL || "https://app.qa.restaunax.com";
const HOUR = 3_600_000;
const NEW_WITHIN_MS = 25 * HOUR;
const CHECK_STALE_MS = 26 * HOUR;

interface CheckItem {
  check: string;
  areaLabel: string;
  businessDate: string;
  code: string;
  text: string;
  since: string;
}

interface Checks {
  restaurantName: string;
  overall: string;
  counts: Record<string, number>;
  latest: { status: string; finishedAt: string | null } | null;
  problems: CheckItem[];
  waiting: CheckItem[];
}

interface Report {
  meta: { today: string; range: { endDate: string } };
  days: { date: string; simRuns: { batch: number; status: string }[] }[];
}

interface Summary {
  name: string;
  restaurantId: string;
  yesterday: string;
  run: string;
  checkedAt: string | null;
  checkStale: boolean;
  fresh: CheckItem[];
  open: CheckItem[];
  waiting: CheckItem[];
}

async function login(): Promise<string> {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD unset");
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { accessToken?: string };
    accessToken?: string;
  } | null;
  const token = body?.data?.accessToken ?? body?.accessToken;
  if (!token) throw new Error(`Admin login failed (${res.status})`);
  return token;
}

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  const body = (await res.json()) as { data?: T } & T;
  return body.data ?? body;
}

async function summarize(
  token: string,
  restaurantId: string,
  now: number
): Promise<Summary> {
  const base = `/api/admin/qa-sim`;
  const checks = await get<Checks>(token, `${base}/checks/${restaurantId}`);
  const report = await get<Report>(
    token,
    `${base}/restaurants/${restaurantId}/report?days=2`
  );
  const yesterday = report.meta.range.endDate;
  const runs = report.days.find((d) => d.date === yesterday)?.simRuns ?? [];
  const last = [...runs].sort((a, b) => b.batch - a.batch)[0];
  const finishedAt = checks.latest?.finishedAt ?? null;
  const isNew = (p: CheckItem) => now - Date.parse(p.since) < NEW_WITHIN_MS;
  return {
    name: checks.restaurantName,
    restaurantId,
    yesterday,
    run: last?.status ?? "MISSING",
    checkedAt: finishedAt,
    checkStale: !finishedAt || now - Date.parse(finishedAt) > CHECK_STALE_MS,
    fresh: checks.problems.filter(isNew),
    open: checks.problems.filter((p) => !isNew(p)),
    waiting: checks.waiting,
  };
}

const needsPerson = (s: Summary) =>
  s.fresh.length > 0 || s.run !== "PASSED" || s.checkStale;

const line = (p: CheckItem) =>
  `${p.businessDate} · ${p.areaLabel} (\`${p.check}\` ${p.code}): ${p.text}`;

function markdown(all: Summary[], runUrl: string | null): string {
  const out = ["# QA simulator: daily summary", ""];
  for (const s of all) {
    out.push(
      `## ${needsPerson(s) ? "🔴" : "🟢"} ${s.name}`,
      "",
      `- Yesterday (${s.yesterday}): run **${s.run}**`,
      `- Self-check: ${s.checkedAt ?? "never"}${s.checkStale ? " **(stale: did not run in the last 26 h)**" : ""}`,
      `- [Open the simulator](${DASHBOARD}/admin?tab=operations&section=demo-data)`,
      ""
    );
    if (s.fresh.length) {
      out.push(`**New problems (${s.fresh.length})**`, "");
      out.push(...s.fresh.map((p) => `- ${line(p)}`), "");
    }
    if (s.open.length) {
      out.push(
        `<details><summary>Still open from earlier days (${s.open.length})</summary>`,
        ""
      );
      out.push(...s.open.map((p) => `- ${line(p)}`), "", "</details>", "");
    }
    if (s.waiting.length) {
      out.push(`<details><summary>Waiting (${s.waiting.length})</summary>`, "");
      out.push(...s.waiting.map((p) => `- ${line(p)}`), "", "</details>", "");
    }
  }
  if (runUrl) out.push(`[This run](${runUrl})`);
  return out.join("\n");
}

function slackText(all: Summary[], runUrl: string | null): string {
  const red = all.filter(needsPerson);
  const head = red.length
    ? `:rotating_light: QA simulator: ${red.length} of ${all.length} restaurants need a look`
    : `:white_check_mark: QA simulator: all ${all.length} restaurants ran clean yesterday`;
  const rows = all.map((s) => {
    const bits = [`run ${s.run}`];
    if (s.fresh.length) bits.push(`${s.fresh.length} new problem(s)`);
    if (s.checkStale) bits.push("self-check stale");
    if (s.open.length) bits.push(`${s.open.length} still open`);
    const first = s.fresh[0];
    return (
      `${needsPerson(s) ? ":red_circle:" : ":large_green_circle:"} *${s.name}*: ${bits.join(", ")}` +
      (first ? `\n      first: ${first.areaLabel}, ${first.text}` : "")
    );
  });
  return [head, ...rows, ...(runUrl ? [runUrl] : [])].join("\n");
}

async function main(): Promise<void> {
  const now = Date.now();
  const token = await login();
  const list = await get<{ restaurantId: string }[]>(
    token,
    "/api/admin/qa-sim/restaurants"
  );
  const all: Summary[] = [];
  for (const r of list) all.push(await summarize(token, r.restaurantId, now));

  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl = GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
  const md = markdown(all, runUrl);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: slackText(all, runUrl) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      console.warn("[sim-daily-summary] Slack notify failed (ignoring):", e);
    }
  }
  if (all.length === 0 || all.some(needsPerson)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
