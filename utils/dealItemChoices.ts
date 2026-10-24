import { expect } from "@playwright/test";
import {
  createMenuItemFull,
  getMenuItemApi,
  getOrderByIdRaw,
  type ApiMenuItem,
} from "./apiHelper";

/**
 * Shared seed + oracle for "the choices made inside a deal reach the order"
 * (TC-906 wind, TC-907 lima).
 *
 * The seeded item ("<label> Wings <run>", $10) has:
 *  - Size (ADJUSTS_PRICE, optional, pick one): "10 PC" $0 / "20 PC" +$4.99.
 *    "20 PC" carries a NESTED child group "Wing Sauce" (forced INCLUDED by the
 *    backend) with "Buffalo" — so a pick there is sent with parentModifierId.
 *  - Dips (INCLUDED, optional): "Ranch Dip" $0 — the free top-level choice.
 * The customer picks 20 PC → Buffalo → Ranch Dip: one paid choice, one free
 * nested choice, one free top-level choice. Deal upcharge = 4.99.
 */
export const SIZE_UPCHARGE = 4.99;

export interface ChoiceMod {
  id: string;
  name: string;
}

export interface ChoiceItem {
  item: ApiMenuItem;
  /** The paid size (+4.99). */
  size: ChoiceMod;
  /** Nested free pick under `size`. */
  sauce: ChoiceMod & { parentModifierId: string };
  /** Free top-level pick. */
  dip: ChoiceMod;
}

export async function seedChoiceItem(
  token: string,
  groupId: string,
  label: string,
  runId: string
): Promise<ChoiceItem> {
  const sizeName = `20 PC ${runId}`;
  const sauceName = `Buffalo ${runId}`;
  const dipName = `Ranch Dip ${runId}`;
  const item = await createMenuItemFull(
    token,
    groupId,
    `${label} Wings ${runId}`,
    10,
    {
      description: "deal item choices: size with a nested sauce, free dip",
      modifierGroups: [
        {
          name: `Size ${runId}`,
          pricingMode: "ADJUSTS_PRICE",
          minSelections: 0,
          maxSelections: 1,
          modifiers: [
            { name: `10 PC ${runId}`, price: 0 },
            {
              name: sizeName,
              price: SIZE_UPCHARGE,
              childModifierGroups: [
                {
                  name: `Wing Sauce ${runId}`,
                  pricingMode: "INCLUDED",
                  minSelections: 0,
                  maxSelections: null,
                  modifiers: [{ name: sauceName }],
                },
              ],
            },
          ],
        },
        {
          name: `Dips ${runId}`,
          pricingMode: "INCLUDED",
          minSelections: 0,
          maxSelections: null,
          modifiers: [{ name: dipName }],
        },
      ],
    }
  );
  const detail = await getMenuItemApi(token, item.id);
  const mods = (detail.modifierGroups ?? []).flatMap((g) => g.modifiers);
  const size = mods.find((m) => m.name === sizeName);
  const sauce = (size?.childModifierGroups ?? [])
    .flatMap((g) => g.modifiers)
    .find((m) => m.name === sauceName);
  const dip = mods.find((m) => m.name === dipName);
  if (!size || !sauce || !dip)
    throw new Error(
      `seedChoiceItem: modifiers not read back: ${JSON.stringify(detail.modifierGroups)}`
    );
  return {
    item,
    size: { id: size.id, name: size.name },
    sauce: { id: sauce.id, name: sauce.name, parentModifierId: size.id },
    dip: { id: dip.id, name: dip.name },
  };
}

/** One `orderDeals[].items[]` entry of a /quote or order body. */
export interface SentDealItem {
  dealItemId?: string;
  menuItemId: string;
  quantity: number;
  upchargeAmount?: number;
  specialInstructions?: string;
  selectedModifiers?: {
    modifierId: string;
    modifierName?: string;
    modifierPrice?: number;
    quantity?: number;
    parentModifierId?: string;
  }[];
}

/**
 * The deal item the customer customised, as the page SENT it. Soft
 * assertions: every missing piece is reported, and the test goes on to pay
 * and read the stored order.
 */
export function expectSentChoices(
  sent: SentDealItem | undefined,
  c: ChoiceItem,
  instruction?: string
): void {
  const mods = sent?.selectedModifiers ?? [];
  const where = `sent deal item: ${JSON.stringify(sent)}`;
  expect
    .soft(
      mods.map((m) => m.modifierId).sort(),
      `/quote orderDeals[].items[<${c.item.name}>].selectedModifiers carries every choice — ${where}`
    )
    .toEqual([c.size.id, c.sauce.id, c.dip.id].sort());
  expect
    .soft(
      mods.find((m) => m.modifierId === c.sauce.id)?.parentModifierId,
      `the nested sauce names its parent (20 PC) as parentModifierId — ${where}`
    )
    .toBe(c.sauce.parentModifierId);
  if (instruction !== undefined)
    expect
      .soft(
        sent?.specialInstructions,
        `/quote orderDeals[].items[<${c.item.name}>].specialInstructions — ${where}`
      )
      .toBe(instruction);
}

/**
 * The stored order (owner GET /api/order/:id): the deal item carries the
 * choices by NAME (what the kitchen ticket prints), the nested pick its
 * parent, and the note. Soft, like expectSentChoices.
 */
export async function expectStoredChoices(
  token: string,
  orderId: string,
  dealId: string,
  c: ChoiceItem,
  instruction?: string
): Promise<void> {
  const order = await getOrderByIdRaw(token, orderId);
  expect(order.status, JSON.stringify(order.data)).toBe(200);
  const deal = (order.data.orderDeals ?? []).find((d) => d.dealId === dealId);
  expect(deal, JSON.stringify(order.data.orderDeals)).toBeTruthy();
  const item = deal!.orderDealItems?.find((i) => i.menuItemId === c.item.id);
  expect(item, JSON.stringify(deal!.orderDealItems)).toBeTruthy();
  const where = `stored orderDealItem: ${JSON.stringify(item)}`;
  const mods = item!.selectedModifiers ?? [];
  expect
    .soft(
      mods.map((m) => m.modifierName).sort(),
      `order orderDeals[0].orderDealItems[<${c.item.name}>].selectedModifiers names every choice — ${where}`
    )
    .toEqual([c.size.name, c.sauce.name, c.dip.name].sort());
  expect
    .soft(
      mods.find((m) => m.modifierName === c.sauce.name)?.parentModifierId,
      `the stored nested sauce keeps parentModifierId — ${where}`
    )
    .toBe(c.sauce.parentModifierId);
  if (instruction !== undefined)
    expect
      .soft(
        item!.specialInstructions,
        `order orderDeals[0].orderDealItems[<${c.item.name}>].specialInstructions — ${where}`
      )
      .toBe(instruction);
}
