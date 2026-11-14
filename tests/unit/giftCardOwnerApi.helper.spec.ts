import { test, expect } from "@playwright/test";
import {
  csvExportPath,
  isMaskedCode,
  rollForwardTies,
  sumMoneyCounts,
} from "../../utils/giftCardOwnerApi";

test("isMaskedCode accepts only the masked shape", () => {
  expect(isMaskedCode("****-****-****-AB12")).toBe(true);
  expect(isMaskedCode("AXBR-7K4M-QW9P-2LFN")).toBe(false);
  expect(isMaskedCode("AXBR7K4MQW9P2LFN")).toBe(false);
});

test("rollForwardTies uses cents, not floats", () => {
  expect(
    rollForwardTies({
      startBalance: 50,
      endBalance: 34,
      difference: 0,
      lines: {
        sold: 25,
        voidedLoads: -25,
        spent: -20,
        refundedToCards: 5,
        cashedOut: -30,
        importedOpening: 30,
        corrections: -1,
      },
    })
  ).toBe(true);
  expect(
    rollForwardTies({
      startBalance: 0.1,
      endBalance: 0.3,
      difference: 0,
      lines: { sold: 0.2 },
    })
  ).toBe(true);
  expect(
    rollForwardTies({
      startBalance: 0,
      endBalance: 40,
      difference: 6,
      lines: { sold: 34 },
    })
  ).toBe(false);
});

test("sumMoneyCounts", () => {
  expect(
    sumMoneyCounts([
      { amount: 0.1, count: 1 },
      { amount: 0.2, count: 2 },
    ])
  ).toEqual({ amount: 0.3, count: 3 });
});

test("csvExportPath is /export.csv for both scopes", () => {
  expect(csvExportPath({ restaurantId: "r1" }, "?status=ACTIVE")).toBe(
    "/api/gift-cards/restaurants/r1/export.csv?status=ACTIVE"
  );
  expect(csvExportPath({ groupId: "g1" })).toBe(
    "/api/gift-cards/groups/g1/export.csv"
  );
});
