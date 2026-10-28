/**
 * humanQa.ts — assertions a human QA tester makes, not just "it rendered".
 *
 * Why: RestauNax #1090. The Books "Send again" success message rendered on
 * the page BEHIND the open dialog. `expect(alert).toBeVisible()` passed —
 * the element was visible to the DOM — while the owner, looking at the
 * dialog, saw nothing until they closed it. These helpers check what the
 * person actually sees:
 *
 *   - expectSeenByUser: visible, inside the viewport, AND on top — the
 *     topmost element at its centre is the element itself (or inside it),
 *     not a dialog backdrop or another window covering it.
 *   - expectHumanText: no raw i18n keys ("booksTaxes.deposits.x"), no raw
 *     ISO timestamps, no "undefined" / "NaN" / "$NaN" / "null".
 *   - expectNoHorizontalOverflow: at phone width, nothing pushes the page
 *     wider than the screen.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/base";

/** The open MUI dialog the person is looking at (the last one opened). */
export const activeDialog = (page: Page): Locator =>
  page.getByRole("dialog").last();

/** Visible, in the viewport, and not covered by anything. */
export async function expectSeenByUser(
  target: Locator,
  what = "the message"
): Promise<void> {
  await expect(target, `${what} is visible`).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await expect(target, `${what} is on screen`).toBeInViewport();
  const onTop = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 40);
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      covered: !hit || !(hit === el || el.contains(hit)),
      by: hit
        ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 80)}`
        : "nothing",
    };
  });
  expect(
    onTop.covered,
    `${what} is covered by ${onTop.by} — the user can't see it`
  ).toBe(false);
}

const RAW_KEY = /\b[a-z][a-zA-Z0-9]+(\.[a-zA-Z0-9_]+){2,}\b/;
const ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const BROKEN = /\bundefined\b|\bNaN\b|\$NaN|\bnull\b|\[object Object\]/;

/** The visible text reads as words a person would write. */
export async function expectHumanText(
  target: Locator,
  what = "the text"
): Promise<void> {
  const text = (await target.innerText()).replace(/\s+/g, " ");
  // Domain names, emails and dotted numbers aren't keys.
  const scrubbed = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "")
    .replace(/\b[\w-]+\.(com|net|org|io|app)\b/gi, "");
  expect(scrubbed, `${what} shows a raw i18n key`).not.toMatch(RAW_KEY);
  expect(text, `${what} shows a raw timestamp`).not.toMatch(ISO);
  expect(text, `${what} shows a broken value`).not.toMatch(BROKEN);
}

/** At the current viewport, the page body doesn't scroll sideways. */
export async function expectNoHorizontalOverflow(
  page: Page,
  what = "the page"
): Promise<void> {
  const { scroll, view } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  expect(scroll, `${what} is wider than the screen`).toBeLessThanOrEqual(
    view + 1
  );
}

/** A phone-sized viewport (iPhone 12–15 width). */
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 900 };
