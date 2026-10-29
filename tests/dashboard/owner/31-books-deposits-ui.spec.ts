/**
 * 31-books-deposits-ui.spec.ts — Books & Taxes → Card deposits, the way an
 * owner (here HQ, who may view any restaurant's books) uses it, on the one QA
 * restaurant with a real QuickBooks sandbox connection (TC-965..967). Tag
 * `@books-live`.
 *
 *   TC-965  The list loads in words (bank date, amount, what it carried,
 *           status — no raw keys or timestamps). Opening a deposit shows what
 *           it carried and "Deposited to your bank" = the row's amount;
 *           "Advanced: debits and credits" opens a balanced entry (total
 *           debit = total credit). Escape closes the window; so does Close.
 *   TC-966  Send again (RestauNax #1090): Cancel in the confirmation sends
 *           nothing and keeps the deposit window open; confirming shows
 *           "Sending…" on a disabled button while it works, then the result
 *           INSIDE the open window — on top, readable — and the list still
 *           says Posted.
 *   TC-967  Phone width (390px): the list's View buttons and the window's
 *           Send again / Close are reachable; nothing overflows.
 *
 * The one write: TC-966 re-sends ONE already-posted deposit. Send again
 * replaces that deposit's own entry in the QuickBooks sandbox (never adds a
 * second one — the never-twice guard), so the company's books are unchanged.
 * Nothing else is connected, re-mapped or posted.
 *
 * "Returned · paid again" (RestauNax #1088) can't be produced on QA (a bank
 * has to return a payout); it is covered by the backend's
 * booksDeposits.int.test.ts.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  accountingRaw,
  adminSearchRestaurantsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectNoHorizontalOverflow,
  expectSeenByUser,
  PHONE,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const NAME = "Rehearsal Kitchen (QA)";

type Rec = Record<string, LooseJson>;
const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test.describe.configure({ mode: "serial" });

test.describe(
  "Books & taxes — Card deposits (UI, QuickBooks sandbox restaurant)",
  { tag: "@books-live" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set"
    );

    let adminToken = "";
    let restaurantId = "";
    /** The newest posted deposit: what the tests open. */
    let posted: Rec | undefined;

    const openDeposits = async (page: Page) => {
      await page.goto(
        `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=books-taxes&section=deposits`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByText("Card deposits").first()).toBeVisible({
        timeout: 25_000,
      });
    };
    /** The window's own Close (the result message has a Close icon too). */
    const closeButton = (page: Page) =>
      activeDialog(page)
        .locator(".MuiDialogActions-root")
        .getByRole("button", { name: "Close" });
    /** The list row (desktop table) for the posted deposit. */
    const row = (page: Page) =>
      page
        .getByRole("row")
        .filter({ hasText: money(Number(posted?.amountCents)) })
        .first();

    test.beforeAll(async () => {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const found = await adminSearchRestaurantsRaw(
        adminToken,
        "Rehearsal Kitchen"
      );
      restaurantId =
        (found.data.restaurants ?? []).find((r) => r.name === NAME)?.id ?? "";
      if (!restaurantId) return;
      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 34 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const list = await accountingRaw<{ data?: { deposits?: Rec[] } }>(
        adminToken,
        restaurantId,
        "GET",
        `/deposits?startDate=${from}&endDate=${today}`
      );
      const deposits = list.data.data?.deposits ?? [];
      // A posted deposit whose amount is unique in the list (one row matches).
      posted = deposits.find(
        (d) =>
          d.status === "POSTED" &&
          !d.returned &&
          deposits.filter((x) => x.amountCents === d.amountCents).length === 1
      );
    });

    test.beforeEach(async ({ adminPage }) => {
      test.skip(!restaurantId, `QA has no restaurant named "${NAME}"`);
      test.skip(
        !posted,
        `${NAME} has no posted deposit in the last 35 days to open`
      );
      await allure.label("feature", "Books & taxes — card deposits (UI)");
      await allure.label("severity", "normal");
      await adminPage.setViewportSize(DESKTOP);
    });

    test("TC-965: the list reads in words; a deposit shows what it carried and a balanced entry; Escape and Close close it", async ({
      adminPage: page,
    }) => {
      await openDeposits(page);
      const table = page.getByRole("table").first();
      await expect(table).toBeVisible({ timeout: 20_000 });
      await expectHumanText(table, "the deposits list");
      await expect(row(page)).toContainText("Posted");

      await row(page).getByRole("button", { name: "View" }).click();
      const dialog = activeDialog(page);
      await expect(dialog).toContainText("What this deposit carried");
      await expect(
        dialog.getByRole("row", { name: /Deposited to your bank/ })
      ).toContainText(money(Number(posted?.amountCents)));
      await expectHumanText(dialog, "the deposit window");

      await dialog
        .getByRole("button", { name: "Advanced: debits and credits" })
        .click();
      const total = dialog.getByRole("row", { name: /^Total/ });
      await expect(total).toBeVisible();
      const cells = (await total.getByRole("cell").allInnerTexts()).map((c) =>
        c.trim()
      );
      expect(cells[1], `entry total row: ${cells.join(" | ")}`).toBe(cells[2]);

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await row(page).getByRole("button", { name: "View" }).click();
      await closeButton(page).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("TC-966: Send again — Cancel sends nothing; confirming shows Sending… then the result inside the open window", async ({
      adminPage: page,
    }) => {
      await openDeposits(page);
      await row(page).getByRole("button", { name: "View" }).click();
      const dialog = activeDialog(page);
      await expect(dialog).toContainText("What this deposit carried");

      let resends = 0;
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/resend")) resends += 1;
      });

      const sendAgain = dialog.getByRole("button", { name: "Send again" });
      await sendAgain.click();
      const confirm = activeDialog(page);
      await expect(confirm).toContainText(
        `Send the ${money(Number(posted?.amountCents))} deposit again?`
      );
      await expectHumanText(confirm, "the Send again confirmation");
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(activeDialog(page)).toContainText(
        "What this deposit carried"
      );
      expect(resends, "Cancel sends nothing").toBe(0);

      // Hold the request so the busy state can be seen, then let it go.
      let release: () => void = () => {};
      const held = new Promise<void>((r) => (release = r));
      await page.route("**/deposits/*/resend", async (route) => {
        await held;
        await route.continue();
      });
      await sendAgain.click();
      const done = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/resend")
      );
      await activeDialog(page)
        .getByRole("button", { name: "Send again" })
        .click();
      const working = activeDialog(page).getByRole("button", {
        name: "Sending…",
      });
      await expect(working).toBeVisible();
      await expect(working).toBeDisabled();
      release();
      const response = await done;
      await page.unroute("**/deposits/*/resend");
      expect(response.status(), await response.text()).toBe(200);
      expect(resends, "one Send again, one request").toBe(1);

      // The result is in the window the owner is looking at, on top.
      const window = activeDialog(page);
      const result = window.getByRole("alert").filter({ hasText: /sent/i });
      await expectSeenByUser(result, "the Send again result");
      await expectHumanText(result, "the Send again result");
      await expect(
        window.getByRole("button", { name: "Send again" })
      ).toBeEnabled();

      await closeButton(page).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(row(page)).toContainText("Posted");
    });

    test("TC-967: phone width — View, Send again and Close are reachable; nothing overflows", async ({
      adminPage: page,
    }) => {
      await page.setViewportSize(PHONE);
      await openDeposits(page);
      const view = page.getByRole("button", { name: "View" }).first();
      await expectSeenByUser(view, "View at phone width");
      await expectNoHorizontalOverflow(page, "Card deposits (phone)");
      await view.click();
      const dialog = activeDialog(page);
      await expectSeenByUser(
        dialog.getByRole("button", { name: "Send again" }),
        "Send again at phone width"
      );
      await expectSeenByUser(closeButton(page), "Close at phone width");
      await closeButton(page).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }
);
