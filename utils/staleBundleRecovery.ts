/**
 * staleBundleRecovery.ts — reload a page whose JavaScript bundle failed to
 * load because a frontend deploy landed mid-navigation.
 *
 * WHY. The suite runs while QA deploys (post-deploy runs, the nightly, manual
 * runs). During a dashboard deploy the old and new containers both serve for a
 * few seconds, so the HTML can come from one version and its hashed
 * `/assets/index-*.js` request from the other. The container that lacks the
 * file answers with the SPA fallback (index.html, `text/html`), the browser
 * refuses it as a module script, and the page stays WHITE: no heading, no
 * tabs, nothing to wait for. Traces from run 39978264305 (2026-10-23 15:36,
 * the frontend deploy of RestauNax #1033) show exactly this for TC-831 and
 * TC-628: one console error, "Failed to load module script: Expected a
 * JavaScript-or-Wasm module script but the server responded with a MIME type
 * of \"text/html\"", then a blank screenshot.
 *
 * WHAT. On that console error (or its dynamic-import twin), wait for the page
 * to finish loading, then reload it, at most MAX_RELOADS times per page. It is
 * event-driven: nothing waits on a clock. A broken bundle is the only trigger,
 * so a page that loaded fine is never touched. Each reload is recorded as a
 * `stale-bundle-reload` annotation on the running test, so the report shows it.
 *
 * Real users hit the same white page during a deploy. That is reported as a
 * product finding, not hidden: the annotation makes every occurrence visible.
 */
import { test, type BrowserContext, type Page } from "@playwright/test";

const STALE_BUNDLE =
  /Failed to load module script|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

const MAX_RELOADS = 3;

const armedContexts = new WeakSet<BrowserContext>();

function annotate(url: string, attempt: number): void {
  try {
    test.info().annotations.push({
      type: "stale-bundle-reload",
      description: `reload ${attempt}/${MAX_RELOADS} of ${url} (bundle failed to load, likely a deploy in progress)`,
    });
  } catch {
    // Outside a running test (e.g. globalSetup): nothing to annotate.
  }
}

function watchPage(page: Page): void {
  let reloads = 0;
  page.on("console", (msg) => {
    if (msg.type() !== "error" || !STALE_BUNDLE.test(msg.text())) return;
    if (reloads >= MAX_RELOADS) return;
    reloads += 1;
    const attempt = reloads;
    const url = page.url();
    annotate(url, attempt);
    // Let the navigation that carried the broken bundle finish first, so a
    // caller's page.goto() resolves instead of being interrupted.
    void page
      .waitForLoadState("load")
      .then(() => page.reload({ waitUntil: "domcontentloaded" }))
      .catch(() => {
        // The page closed or navigated away: nothing left to recover.
      });
  });
}

/** Watch every current and future page of `context`. Idempotent. */
export function armStaleBundleRecovery(context: BrowserContext): void {
  if (armedContexts.has(context)) return;
  armedContexts.add(context);
  for (const page of context.pages()) watchPage(page);
  context.on("page", watchPage);
}
