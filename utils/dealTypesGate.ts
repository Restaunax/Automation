/**
 * dealTypesGate.ts — deploy gates for guided deal types (restaunax
 * feat/guided-deal-types, docs/features/DEAL_TYPES.md).
 *
 * The specs land before the backend + dashboard changes reach QA. While a
 * part's flag is false its tests SKIP with a reason (deploy lag is not a
 * product failure). Once the part is confirmed on QA, flip its flag to true:
 * the same call then FAILS when the capability is missing, so a regression
 * can't hide as a skip. Same contract as dealScheduleGate.ts.
 */
import { test, expect } from "../fixtures/base";
import { getAiDealQuestionsPublic } from "./apiHelper";

export const DEAL_TYPES_ON_QA = {
  /** Backend: dealType / discountPercent / role, resolveDealType on every write. */
  backend: false,
  /** Dashboard: the type-first deal form (deal-type-* cards, one line per unit). */
  dashboard: false,
  /**
   * Backend: deal picks must match their slots (all channels) + "buy any X,
   * get one free" category BOGO priced from the picks + orders store the
   * server price (DEAL_TYPES.md, restaunax "picks must match their slots").
   */
  slots: false,
};

export type DealTypesPart = keyof typeof DEAL_TYPES_ON_QA;

const REASON: Record<DealTypesPart, string> = {
  backend:
    "Guided deal types backend (restaunax feat/guided-deal-types) is not on QA yet — /ai/questions has no 'dealTypes'",
  dashboard:
    "Guided deal form (restaunax feat/guided-deal-types) is not on QA yet — no deal-type-* cards in Create Deal",
  slots:
    "Deal slot matching / category BOGO (restaunax 'picks must match their slots') is not on QA yet — a pick outside the deal is still accepted",
};

/** Skip (flag off) or fail (flag on) when `present` is false. */
export function requireDealTypes(part: DealTypesPart, present: boolean): void {
  if (DEAL_TYPES_ON_QA[part]) {
    expect(present, REASON[part]).toBe(true);
    return;
  }
  test.skip(!present, REASON[part]);
}

let backendProbe: Promise<boolean> | undefined;

/**
 * Presence signal for the backend part: the public, static AI questionnaire
 * carries the 5th question id "dealTypes". Cached per worker.
 */
export function dealTypesOnBackend(): Promise<boolean> {
  backendProbe ??= getAiDealQuestionsPublic()
    .then((res) => (res.data.questions ?? []).some((q) => q.id === "dealTypes"))
    // An unreachable probe reads as "not deployed"; with the flag on that fails loudly.
    .catch(() => false);
  return backendProbe;
}

let slotsProbe: Promise<boolean> | undefined;

/**
 * Presence signal for the slots part. It needs a tenant + deal, so the spec
 * supplies the probe (e.g. "/quote refuses a pick that isn't in the deal");
 * the first call's answer is cached per worker. A probe that throws reads as
 * "not deployed"; with the flag on that fails loudly.
 */
export function dealSlotRulesOnBackend(
  probe: () => Promise<boolean>
): Promise<boolean> {
  slotsProbe ??= probe().catch(() => false);
  return slotsProbe;
}
