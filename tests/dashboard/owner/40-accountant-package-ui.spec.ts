/**
 * 40-accountant-package-ui.spec.ts — Books & taxes WITHOUT the add-on (UI):
 * the tab opens with no refused load, the package panel downloads PDF, Excel
 * and CSV ZIP for last month, and after a download the owner is told "Want
 * this sent to your accountant every month? Ask us." (TC-1951..1952). Then the
 * Analytics → Daily Report subtab (`?view=daily-report`) shows the report and
 * the Overview's "Download for your accountant" opens the same panel in a
 * dialog (TC-1953). A range of only today is refused with "Nothing to include
 * yet…" in the language asked for (TC-1954, API), and Products → Books &
 * Taxes "See it in action" opens the add-on's first section (TC-1955).
 *
 * Browser. A per-run throwaway owner with NO add-on logs in through the UI
 * (loginViaUi). Every /api/ response is watched: a screen the owner can see
 * must never answer 401/403 while it loads (feedback: screen loads never 403).
 * Serial. Run against a production build of the dashboard.
 */
import * as allure from "allure-js-commons";
import type { Page, Response as PwResponse } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const ASK_LINE = "Want this sent to your accountant every month? Ask us.";
// The server's refusal for a range with no closed or finished day (EN / ES).
const NOTHING_YET = {
  en: "Nothing to include yet: the most recent days are added once they're closed or over.",
  es: "Todavía no hay nada que incluir: los días más recientes se agregan cuando se cierran o terminan.",
} as const;
/** Today in the tenant's time zone (a Miami restaurant): never closed or over. */
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date()
  );

const FORMATS = [
  { label: "PDF", ext: "pdf", type: /application\/pdf/ },
  {
    label: "Excel",
    ext: "xlsx",
    type: /spreadsheetml\.sheet|application\/vnd\.openxmlformats/,
  },
  { label: "CSV (ZIP)", ext: "zip", type: /application\/zip/ },
] as const;

test.describe.configure({ mode: "serial" });

test.describe("Owner — accountant package and Daily Report without the add-on (UI)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  const refused: string[] = [];

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const watch = (res: PwResponse) => {
    if (
      /\/api\/|\/restaurant\//.test(res.url()) &&
      [401, 403].includes(res.status())
    )
      refused.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  };
  const manage = (query: string) =>
    page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[package-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
    session.page.on("response", watch);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    refused.length = 0;
    await allure.label("feature", "Books & taxes (dashboard)");
    await allure.label("severity", "critical");
  });

  test("TC-1951: without the add-on, Books & taxes opens on the package with no refused load, and last month downloads as PDF, Excel and CSV ZIP", async () => {
    await manage("tab=books-taxes&section=accountantPackage");
    const panel = page().getByTestId("accountant-package");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(
      panel.getByRole("button", { name: "Last month" })
    ).toHaveAttribute("aria-pressed", "true");

    for (const f of FORMATS) {
      await panel.getByTestId("accountant-package-format").click();
      await page().getByRole("option", { name: f.label, exact: true }).click();
      const [res, download] = await Promise.all([
        // The exact download request: the path ends in /accountant-package
        // and carries a format= query (not the /files list, not a status poll).
        page().waitForResponse((r) => {
          const u = new URL(r.url());
          return (
            u.pathname.endsWith("/accountant-package") &&
            u.searchParams.has("format")
          );
        }),
        page().waitForEvent("download"),
        panel.getByTestId("accountant-package-download").click(),
      ]);
      expect(res.status(), f.label).toBe(200);
      expect(res.headers()["content-type"], f.label).toMatch(f.type);
      expect(download.suggestedFilename(), f.label).toMatch(
        new RegExp(`\\.${f.ext}$`)
      );
      await expect(page().getByTestId("accountant-package-outcome")).toHaveText(
        "Your package is downloading.",
        { timeout: 20_000 }
      );
    }
    expect(refused).toEqual([]);
  });

  test("TC-1952: after a download without the add-on, the page offers the monthly send as an ask, never a price", async () => {
    // The previous test left its last download's outcome on screen; start
    // fresh so the line is the one this download raised.
    await manage("tab=books-taxes&section=accountantPackage");
    const panel = page().getByTestId("accountant-package");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId("books-ask-us")).toHaveCount(0);
    await Promise.all([
      page().waitForEvent("download"),
      panel.getByTestId("accountant-package-download").click(),
    ]);
    const ask = panel.getByTestId("books-ask-us");
    await expect(ask).toBeVisible({ timeout: 20_000 });
    await expect(ask).toHaveText(ASK_LINE);
    await expect(ask.getByRole("button", { name: "Ask us." })).toBeVisible();
    // Wording is page-wide; a price is looked for only where an add-on is
    // offered (the ask line and the add-on sections), because the page also
    // shows real "$0.00" figures.
    await expect(page().getByText(/coming soon|upgrade/i)).toHaveCount(0);
    for (const offer of [
      ask,
      page().locator('[data-testid^="books-addon-"]'),
    ]) {
      await expect(offer.getByText(/\$\d/)).toHaveCount(0);
    }
    expect(refused).toEqual([]);
  });

  test("TC-1953: Analytics → Daily Report shows the report, and Download for your accountant opens the package dialog", async () => {
    await manage("tab=Analytics&view=daily-report");
    await expect(
      page().getByRole("tab", { name: "Daily Report", selected: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page().getByText("At a Glance", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // The download button lives on the Overview subtab; open it from there.
    await page().getByRole("tab", { name: "Overview", exact: true }).click();
    await page()
      .getByRole("button", { name: "Download for your accountant" })
      .click();
    const dialog = page().getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Download for your accountant" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByTestId("accountant-package")).toBeVisible();
    await expect(
      dialog.getByTestId("accountant-package-download")
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    expect(refused).toEqual([]);
  });

  test('TC-1954: a package for only today is refused with "Nothing to include yet", in the language asked for (API)', async () => {
    const day = localToday();
    const path = (extra = "") =>
      `/api/reports/${restaurantId}/accountant-package?startDate=${day}&endDate=${day}&format=pdf${extra}`;
    const cases: {
      name: string;
      extra: string;
      headers: Record<string, string>;
      want: string;
    }[] = [
      {
        name: "EN",
        extra: "&lang=en",
        headers: { "Accept-Language": "en" },
        want: NOTHING_YET.en,
      },
      {
        name: "ES by Accept-Language",
        extra: "",
        headers: { "Accept-Language": "es" },
        want: NOTHING_YET.es,
      },
      // The dashboard sends the language it is showing (lang=), which wins.
      {
        name: "ES by lang=",
        extra: "&lang=es",
        headers: { "Accept-Language": "en" },
        want: NOTHING_YET.es,
      },
    ];
    for (const c of cases) {
      const res = await apiRequestRaw<{ success?: boolean; message?: string }>(
        "GET",
        path(c.extra),
        undefined,
        ownerToken,
        c.headers
      );
      expect(res.status, `${c.name}: ${JSON.stringify(res.data)}`).toBe(400);
      expect(res.data.success, c.name).toBe(false);
      expect(res.data.message, c.name).toBe(c.want);
    }
  });

  test('TC-1955: Products → Books & Taxes "See it in action" opens the add-on\'s first section', async () => {
    await manage("tab=Billing&section=addons");
    const card = page().getByTestId("product-card-ACCOUNTING_SYNC");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "See it in action" }).click();
    await expect(page()).toHaveURL(/[?&]tab=books-taxes(&|$)/);
    await expect(page()).toHaveURL(/[?&]section=books(&|$)/);
    // The add-on's first section says what it does, with the ask; no price.
    const teaser = page().getByTestId("books-addon-books");
    await expect(teaser).toBeVisible({ timeout: 30_000 });
    await expect(teaser.getByText(/\$\d/)).toHaveCount(0);
    expect(refused).toEqual([]);
  });
});
