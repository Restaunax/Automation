/**
 * api-split-hours.spec.ts — split hours through the API: a day (a weekly day
 * or a holiday date) can have several open windows, e.g. lunch 12:00–3:00 PM,
 * a break, dinner 5:00–10:00 PM (RestauNax feat/split-hours, restaunax
 * docs/features/SPLIT_HOURS.md) (TC-2000..2007).
 *
 * One row per day: `openingTime`/`closingTime` are the OUTER SPAN (first
 * opening, last closing) and `windows` lists the windows when the day has two
 * or more, else null.
 *
 *   TC-2000 Save a week with split days and read it back: outer span +
 *           windows, sorted even when sent out of order; a one-window day,
 *           a 24-hour day and a closed day keep `windows: null`.
 *   TC-2001 Refusals (overlap, touching, more than 4, same open and close, a
 *           window other than the last past midnight): 400 with the sentence,
 *           and the saved hours are untouched.
 *   TC-2002 A day sent with NO `windows` key (an editor from before split
 *           hours) keeps its windows when its times equal the saved outer
 *           span and drops them when a time changed; `windows: null` clears.
 *   TC-2003 The save preview judges the windows and writes nothing.
 *   TC-2004 Ordering status: in the break it is closed and names the NEXT
 *           WINDOW today; inside the first window it is open until THAT
 *           window's close.
 *   TC-2005 The order gate: inside a window accepted; "as soon as possible"
 *           in the break refused with the reopening time; a time in the
 *           dinner window accepted from the break; a time in the break refused
 *           (ORDER_SCHEDULED_OUTSIDE_HOURS) naming both windows.
 *   TC-2006 Holiday & special hours with windows: create, read back, the
 *           refusals, the no-`windows`-key rule on edit, a split TODAY closes
 *           the break for ordering, delete.
 *   TC-2007 The public reads carry `windows` on each day.
 *
 * A test can't move the clock, so today's two windows are built AROUND the
 * restaurant's current local time (utils/dealSchedule.ts splitDayAroundNow).
 * Near local midnight there is no room for that and those cases skip.
 *
 * Data: a fresh owner + restaurant (createSecondOwner alwaysFresh): published,
 * accepting orders, 7% tax, one $12 item; deleted afterwards. Orders the gate
 * accepts stay INITIALIZED (never paid) and go with the restaurant.
 * Gated: RELEASED_ON_QA.splitHours. Tag @split-hours.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  ensureTaxRate,
  getBusinessHoursRaw,
  placeGuestPickupOrderRaw,
  putBusinessHoursRaw,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  updateRestaurantSettingsApi,
  type BusinessHoursRow,
  type HoursWindowRow,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addDays,
  hoursPreviewRaw,
  looksLikeKey,
  orderingStatusRaw,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";
import {
  atLocal,
  DAY_NAMES,
  formatClockEn,
  hhmm,
  NO_ROOM_FOR_SPLIT_DAY,
  normalizeSpaces,
  splitDayAroundNow,
  zonedInstant,
  type DayName,
  type SplitDayPlan,
} from "../../../utils/dealSchedule";
import { probeSplitHours, requireRelease } from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
type Day = Record<string, unknown> & { day: DayName };

const LUNCH: HoursWindowRow = {
  openingTime: "12:00:00",
  closingTime: "15:00:00",
};
const DINNER: HoursWindowRow = {
  openingTime: "17:00:00",
  closingTime: "22:00:00",
};
const TAX_PERCENT = 7;

/** An open day as a new editor sends it: outer span + the `windows` key. */
const openDay = (day: DayName, windows: HoursWindowRow[]): Day => ({
  day,
  openingTime: windows[0]!.openingTime,
  closingTime: windows[windows.length - 1]!.closingTime,
  isClosed: false,
  is24Hours: false,
  windows: windows.length > 1 ? windows : null,
});

/** Lunch and dinner every day. */
const splitWeek = (): Day[] =>
  DAY_NAMES.map((day) => openDay(day, [LUNCH, DINNER]));

/** `week` with one day replaced. */
const withDay = (week: Day[], day: Day): Day[] =>
  week.map((d) => (d.day === day.day ? day : d));

test.describe.configure({ mode: "serial" });

test.describe("Owner — split hours (API)", { tag: "@split-hours" }, () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const guestEmail = `auto-guest-${runId}@restaunax-test.com`;
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let timeZone = "";
  let burger = { id: "", name: "Burger", price: 12 };

  const savedRows = async (): Promise<BusinessHoursRow[]> => {
    const res = await getBusinessHoursRaw(ownerToken, restaurantId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.businessHours ?? [];
  };
  const savedDay = async (day: DayName): Promise<BusinessHoursRow> => {
    const row = (await savedRows()).find((r) => r.day === day);
    if (!row) throw new Error(`[split-hours] no saved row for ${day}`);
    return row;
  };
  const save = async (week: Day[]) => {
    const res = await putBusinessHoursRaw(ownerToken, restaurantId, week);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
  };
  /**
   * Save a week whose TODAY has two windows around now (the other days are
   * lunch + dinner). Skips the test when today has no room for them.
   */
  const saveToday = async (where: "break" | "first"): Promise<SplitDayPlan> => {
    const plan = splitDayAroundNow(timeZone, where);
    test.skip(!plan, NO_ROOM_FOR_SPLIT_DAY);
    await save(withDay(splitWeek(), openDay(plan!.dayName, plan!.windows)));
    return plan!;
  };
  const status = async (): Promise<Rec> => {
    const res = await orderingStatusRaw(ownerToken, restaurantId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.data ?? {};
  };
  const order = (scheduledFor: string | null) =>
    placeGuestPickupOrderRaw(restaurantId, {
      item: burger,
      taxPercent: TAX_PERCENT,
      scheduledFor,
      customerEmail: guestEmail,
    });
  /** "5:00 PM" for a window edge. */
  const clock = (minuteOfDay: number) => formatClockEn(hhmm(minuteOfDay));
  const instant = (plan: SplitDayPlan, minuteOfDay: number) =>
    zonedInstant(timeZone, plan.dateKey, minuteOfDay).toISOString();

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[split-hours] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, TAX_PERCENT);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await stripeTestOnboardingRaw(ownerToken, restaurantId);
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burger = {
      ...burger,
      id: (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id,
    };
    timeZone = String(
      (await specialHoursRaw(ownerToken, restaurantId, "GET")).data.timeZone ??
        ""
    );
    if (!timeZone) throw new Error("[split-hours] no time zone");
    // One-window days in the shape every backend takes (no `windows` key), so
    // the release probe has rows to read.
    const plain = await putBusinessHoursRaw(
      ownerToken,
      restaurantId,
      DAY_NAMES.map((day) => ({
        day,
        openingTime: "08:00:00",
        closingTime: "22:00:00",
        isClosed: false,
        is24Hours: false,
      }))
    );
    if (!plain.ok)
      throw new Error(`[split-hours] hours: ${JSON.stringify(plain.data)}`);
  });

  test.afterAll(async () => {
    // Best-effort cleanup: a failed delete must not mask the test result.
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    requireRelease(
      "splitHours",
      await probeSplitHours(ownerToken, restaurantId)
    );
    await allure.label("feature", "Split hours");
    await allure.label("severity", "critical");
  });

  test("TC-2000: a split week saves and reads back as outer span + windows, sorted", async () => {
    const breakfast = { openingTime: "07:00:00", closingTime: "10:00:00" };
    const late = { openingTime: "18:00:00", closingTime: "01:00:00" };
    const week: Day[] = [
      // Sent dinner first, with row times a careless editor would compute.
      {
        day: "MONDAY",
        openingTime: DINNER.openingTime,
        closingTime: LUNCH.closingTime,
        isClosed: false,
        is24Hours: false,
        windows: [DINNER, LUNCH],
      },
      // Three windows, out of order, times without seconds.
      {
        day: "TUESDAY",
        openingTime: "07:00",
        closingTime: "22:00",
        isClosed: false,
        is24Hours: false,
        windows: [
          { openingTime: "17:00", closingTime: "22:00" },
          { openingTime: "07:00", closingTime: "10:00" },
          { openingTime: "12:00", closingTime: "15:00" },
        ],
      },
      // A list of one is a one-window day.
      {
        day: "WEDNESDAY",
        openingTime: LUNCH.openingTime,
        closingTime: LUNCH.closingTime,
        isClosed: false,
        is24Hours: false,
        windows: [LUNCH],
      },
      openDay("THURSDAY", [
        { openingTime: "08:00:00", closingTime: "22:00:00" },
      ]),
      // Only the last window may run past midnight.
      openDay("FRIDAY", [LUNCH, late]),
      {
        day: "SATURDAY",
        openingTime: null,
        closingTime: null,
        isClosed: false,
        is24Hours: true,
        windows: null,
      },
      {
        day: "SUNDAY",
        openingTime: null,
        closingTime: null,
        isClosed: true,
        is24Hours: false,
        windows: null,
      },
    ];
    const put = await putBusinessHoursRaw(ownerToken, restaurantId, week);
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    expect(looksLikeKey(put.data.message)).toBe(false);

    const rows = await savedRows();
    expect(rows).toHaveLength(7);
    const read = (day: DayName) => {
      const { openingTime, closingTime, isClosed, is24Hours, windows } =
        rows.find((r) => r.day === day)!;
      return { openingTime, closingTime, isClosed, is24Hours, windows };
    };
    const open = { isClosed: false, is24Hours: false };
    expect(read("MONDAY")).toEqual({
      ...open,
      openingTime: "12:00:00",
      closingTime: "22:00:00",
      windows: [LUNCH, DINNER],
    });
    expect(read("TUESDAY")).toEqual({
      ...open,
      openingTime: "07:00:00",
      closingTime: "22:00:00",
      windows: [breakfast, LUNCH, DINNER],
    });
    expect(read("WEDNESDAY")).toEqual({
      ...open,
      openingTime: "12:00:00",
      closingTime: "15:00:00",
      windows: null,
    });
    expect(read("THURSDAY")).toEqual({
      ...open,
      openingTime: "08:00:00",
      closingTime: "22:00:00",
      windows: null,
    });
    expect(read("FRIDAY")).toEqual({
      ...open,
      openingTime: "12:00:00",
      closingTime: "01:00:00",
      windows: [LUNCH, late],
    });
    expect(read("SATURDAY")).toMatchObject({
      isClosed: false,
      is24Hours: true,
      windows: null,
    });
    expect(read("SUNDAY")).toEqual({
      openingTime: null,
      closingTime: null,
      isClosed: true,
      is24Hours: false,
      windows: null,
    });
  });

  test("TC-2001: overlapping, touching, too many and impossible windows are refused in words, and the saved hours stay", async () => {
    await save(splitWeek());
    const before = await savedRows();
    const w = (openingTime: string, closingTime: string) => ({
      openingTime,
      closingTime,
    });
    const refusals: [string, HoursWindowRow[], string][] = [
      [
        "overlap",
        [w("12:00:00", "15:00:00"), w("14:00:00", "22:00:00")],
        "Two sets of hours on the same day overlap. Leave a gap between them.",
      ],
      [
        "one closes as the next opens",
        [w("12:00:00", "15:00:00"), w("15:00:00", "22:00:00")],
        "Two sets of hours on the same day overlap. Leave a gap between them.",
      ],
      [
        "five windows",
        [
          w("06:00:00", "07:00:00"),
          w("08:00:00", "09:00:00"),
          w("10:00:00", "11:00:00"),
          w("12:00:00", "13:00:00"),
          w("14:00:00", "15:00:00"),
        ],
        "A day can have up to 4 sets of hours.",
      ],
      [
        "opens and closes at the same minute",
        [w("12:00:00", "15:00:00"), w("17:00:00", "17:00:00")],
        "Opening and closing times can't be the same.",
      ],
      [
        "lunch runs past midnight",
        [w("12:00:00", "01:00:00"), w("17:00:00", "22:00:00")],
        "Only the last set of hours in a day can run past midnight, and it has to end before the day's first opening.",
      ],
    ];
    for (const [what, windows, message] of refusals) {
      await allure.step(`refused: ${what}`, async () => {
        const res = await putBusinessHoursRaw(
          ownerToken,
          restaurantId,
          withDay(splitWeek(), {
            day: "WEDNESDAY",
            openingTime: "06:00:00",
            closingTime: "23:00:00",
            isClosed: false,
            is24Hours: false,
            windows,
          })
        );
        expect(res.status, `${what}: ${JSON.stringify(res.data)}`).toBe(400);
        expect(res.data.message, what).toBe(message);
      });
    }
    // Same rows, same ids: nothing was deleted and written again.
    expect(await savedRows()).toEqual(before);
  });

  test("TC-2002: a day sent without `windows` keeps them if its times are unchanged, drops them if not; null clears", async () => {
    await save(splitWeek());
    /** The week as an editor from before split hours sends it. */
    const oldEditorWeek = (): Day[] =>
      DAY_NAMES.map((day) => ({
        day,
        openingTime: "12:00:00",
        closingTime: "22:00:00",
        isClosed: false,
        is24Hours: false,
      }));

    await allure.step("untouched days keep their windows", async () => {
      // One day without seconds: old rows and old editors send "HH:MM".
      await save(
        withDay(oldEditorWeek(), {
          day: "THURSDAY",
          openingTime: "12:00",
          closingTime: "22:00",
          isClosed: false,
          is24Hours: false,
        })
      );
      for (const row of await savedRows()) {
        expect(row.windows, row.day).toEqual([LUNCH, DINNER]);
        expect(row.openingTime, row.day).toBe("12:00:00");
        expect(row.closingTime, row.day).toBe("22:00:00");
      }
    });

    await allure.step("a changed time drops that day's split", async () => {
      await save(
        withDay(oldEditorWeek(), {
          day: "MONDAY",
          openingTime: "12:00:00",
          closingTime: "21:00:00",
          isClosed: false,
          is24Hours: false,
        })
      );
      expect(await savedDay("MONDAY")).toMatchObject({
        openingTime: "12:00:00",
        closingTime: "21:00:00",
        windows: null,
      });
      expect((await savedDay("TUESDAY")).windows).toEqual([LUNCH, DINNER]);
    });

    await allure.step("`windows: null` makes it one window", async () => {
      await save(
        withDay(oldEditorWeek(), {
          day: "TUESDAY",
          openingTime: "12:00:00",
          closingTime: "22:00:00",
          isClosed: false,
          is24Hours: false,
          windows: null,
        })
      );
      expect(await savedDay("TUESDAY")).toMatchObject({
        openingTime: "12:00:00",
        closingTime: "22:00:00",
        windows: null,
      });
      expect((await savedDay("WEDNESDAY")).windows).toEqual([LUNCH, DINNER]);
    });
  });

  test("TC-2003: the save preview judges the windows and writes nothing", async () => {
    const plan = await saveToday("break");
    const before = await savedRows();
    const today = openDay(plan.dayName, plan.windows);

    await allure.step(
      "the same split week: still closed, reopens for dinner",
      async () => {
        const res = await hoursPreviewRaw(
          ownerToken,
          restaurantId,
          withDay(splitWeek(), today)
        );
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        expect(res.data.data).toMatchObject({
          effect: "STAYS_CLOSED",
          openNow: false,
          openAfterSave: false,
          needsConfirm: false,
          nextOpenAt: instant(plan, plan.second.startMinute),
        });
        expect(normalizeSpaces(String(res.data.data?.message))).toBe(
          `You're closed now. You'll reopen ${clock(plan.second.startMinute)}.`
        );
      }
    );

    await allure.step(
      "one window over the break: saving opens now",
      async () => {
        const res = await hoursPreviewRaw(
          ownerToken,
          restaurantId,
          withDay(
            splitWeek(),
            openDay(plan.dayName, [
              {
                openingTime: plan.windows[0]!.openingTime,
                closingTime: plan.windows[1]!.closingTime,
              },
            ])
          )
        );
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        expect(res.data.data).toMatchObject({
          effect: "OPENS_NOW",
          openNow: false,
          openAfterSave: true,
          needsConfirm: false,
          closesAt: instant(plan, plan.second.endMinute),
        });
        expect(normalizeSpaces(String(res.data.data?.message))).toBe(
          `Saving this opens you now until ${clock(plan.second.endMinute)}. Customers can order online right away.`
        );
      }
    );

    await allure.step(
      "windows the save would refuse are refused here too",
      async () => {
        const res = await hoursPreviewRaw(
          ownerToken,
          restaurantId,
          withDay(splitWeek(), {
            ...today,
            windows: [plan.windows[0]!, plan.windows[0]!],
          })
        );
        expect(res.status, JSON.stringify(res.data)).toBe(400);
        expect(looksLikeKey(res.data.message)).toBe(false);
      }
    );

    expect(await savedRows(), "the preview wrote nothing").toEqual(before);
  });

  test("TC-2004: ordering status — the break names the next window today; inside lunch it closes at lunch's close", async () => {
    await allure.step("in the break", async () => {
      const plan = await saveToday("break");
      const opens = clock(plan.second.startMinute);
      const now = await status();
      expect(now).toMatchObject({
        state: "CLOSED_BY_HOURS",
        acceptingOrders: true,
        isOpenByHours: false,
        closesAt: null,
        opensAt: instant(plan, plan.second.startMinute),
      });
      expect(normalizeSpaces(String(now.headline))).toBe(
        `Closed · Opens ${opens}`
      );
      expect(normalizeSpaces(String(now.hoursLine))).toBe(`Opens ${opens}`);
    });

    await allure.step("inside the first window", async () => {
      const plan = await saveToday("first");
      const closes = clock(plan.first.endMinute);
      const now = await status();
      expect(now).toMatchObject({
        state: "OPEN",
        isOpenByHours: true,
        opensAt: null,
        // The current window's close, not the end of the night.
        closesAt: instant(plan, plan.first.endMinute),
      });
      expect(normalizeSpaces(String(now.hoursLine))).toBe(
        `Open until ${closes}`
      );
      expect(normalizeSpaces(String(now.headline))).toBe(
        `Open · closes ${closes}`
      );

      // Proposing the break from here closes the store the moment it saves.
      const breakPlan = splitDayAroundNow(timeZone, "break");
      test.skip(!breakPlan, NO_ROOM_FOR_SPLIT_DAY);
      const preview = await hoursPreviewRaw(
        ownerToken,
        restaurantId,
        withDay(splitWeek(), openDay(breakPlan!.dayName, breakPlan!.windows))
      );
      expect(preview.status, JSON.stringify(preview.data)).toBe(200);
      expect(preview.data.data).toMatchObject({
        effect: "CLOSES_NOW",
        openNow: true,
        openAfterSave: false,
        needsConfirm: true,
      });
      expect(normalizeSpaces(String(preview.data.data?.message))).toBe(
        `Saving this closes you now. Online orders are refused until you reopen. You'll reopen ${clock(breakPlan!.second.startMinute)}.`
      );
    });
  });

  test("TC-2005: the order gate — a window takes the order, the break refuses it and says when the restaurant reopens", async () => {
    await allure.step("inside the first window: ASAP is accepted", async () => {
      await saveToday("first");
      const asap = await order(null);
      expect(asap.status, JSON.stringify(asap.data)).toBe(201);
      expect(asap.data.status).toBe("INITIALIZED");
    });

    const plan = await saveToday("break");
    const dinner = `${clock(plan.second.startMinute)} to ${clock(plan.second.endMinute)}`;
    const lunch = `${clock(plan.first.startMinute)} to ${clock(plan.first.endMinute)}`;

    await allure.step(
      "in the break: ASAP is refused with the reopening time",
      async () => {
        const asap = await order(null);
        expect(asap.status, JSON.stringify(asap.data)).toBe(400);
        expect(normalizeSpaces(String(asap.data.message))).toBe(
          `This restaurant is closed right now. It opens again at ${clock(plan.second.startMinute)}.`
        );
      }
    );

    await allure.step(
      "from the break: a time in the dinner window is accepted",
      async () => {
        const at = atLocal(
          timeZone,
          plan.dateKey,
          hhmm(plan.second.startMinute + 15)
        );
        const later = await order(at);
        expect(later.status, JSON.stringify(later.data)).toBe(201);
        expect(new Date(String(later.data.scheduledFor)).toISOString()).toBe(
          at
        );
      }
    );

    await allure.step(
      "a time in the break is refused, naming both windows",
      async () => {
        // 15 minutes before dinner opens: still the break, and still ahead of now.
        const inBreak = await order(
          atLocal(timeZone, plan.dateKey, hhmm(plan.second.startMinute - 15))
        );
        expect(inBreak.status, JSON.stringify(inBreak.data)).toBe(400);
        expect(inBreak.data.errorCode).toBe("ORDER_SCHEDULED_OUTSIDE_HOURS");
        const message = normalizeSpaces(String(inBreak.data.message));
        expect(message).toContain(`it's open ${lunch} and ${dinner} (`);
        expect(message).toMatch(
          /^The restaurant isn't open at that time\. On /
        );
      }
    );

    await allure.step(
      "the first minute of dinner is open, its closing minute is not",
      async () => {
        const opening = await order(
          atLocal(timeZone, plan.dateKey, hhmm(plan.second.startMinute))
        );
        expect(opening.status, JSON.stringify(opening.data)).toBe(201);
        const closing = await order(
          atLocal(timeZone, plan.dateKey, hhmm(plan.second.endMinute))
        );
        expect(closing.status, JSON.stringify(closing.data)).toBe(400);
        expect(closing.data.errorCode).toBe("ORDER_SCHEDULED_OUTSIDE_HOURS");
      }
    );
  });

  test("TC-2006: holiday & special hours with windows — create, read back, refusals, edit, a split today, delete", async () => {
    const special = (
      method: "GET" | "POST" | "PUT" | "DELETE",
      id?: string,
      body?: Record<string, unknown>
    ) => specialHoursRaw(ownerToken, restaurantId, method, id, body);
    const listed = async (): Promise<Rec[]> => {
      const res = await special("GET");
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      return Array.isArray(res.data.data) ? (res.data.data as Rec[]) : [];
    };
    const today = splitDayAroundNow(timeZone, "break")?.dateKey;
    test.skip(!today, NO_ROOM_FOR_SPLIT_DAY);
    const date = addDays(today!, 10);
    const brunch = { openingTime: "11:00:00", closingTime: "14:00:00" };
    const supper = { openingTime: "17:00:00", closingTime: "21:00:00" };
    const ids: string[] = [];
    const deleted: number[] = [];

    try {
      const created = await special("POST", undefined, {
        date,
        isClosed: false,
        note: `Auto split ${runId}`,
        // Supper first: the server sorts.
        windows: [supper, brunch],
      });
      expect(created.status, JSON.stringify(created.data)).toBe(201);
      const row = created.data.data as Rec;
      ids.push(String(row.id));
      expect(row).toMatchObject({
        date,
        isClosed: false,
        openingTime: "11:00:00",
        closingTime: "21:00:00",
        windows: [brunch, supper],
      });
      expect((await listed()).find((r) => r.id === row.id)).toMatchObject({
        openingTime: "11:00:00",
        closingTime: "21:00:00",
        windows: [brunch, supper],
      });

      await allure.step("refusals, in words, change nothing", async () => {
        const overlap = await special("PUT", ids[0], {
          date,
          isClosed: false,
          windows: [
            brunch,
            { openingTime: "13:00:00", closingTime: "21:00:00" },
          ],
        });
        expect(overlap.status, JSON.stringify(overlap.data)).toBe(400);
        expect(overlap.data.message).toBe(
          "Two sets of hours overlap. Leave a gap between them."
        );
        const five = await special("PUT", ids[0], {
          date,
          isClosed: false,
          windows: [6, 8, 10, 12, 14].map((h) => ({
            openingTime: `${String(h).padStart(2, "0")}:00:00`,
            closingTime: `${String(h + 1).padStart(2, "0")}:00:00`,
          })),
        });
        expect(five.status, JSON.stringify(five.data)).toBe(400);
        expect(five.data.message).toBe(
          "A date can have up to 4 sets of hours."
        );
        expect((await listed()).find((r) => r.id === ids[0])).toMatchObject({
          windows: [brunch, supper],
        });
      });

      await allure.step(
        "an edit without `windows` keeps them; null clears",
        async () => {
          // An editor from before split hours changes only the note.
          const noted = await special("PUT", ids[0], {
            date,
            isClosed: false,
            openingTime: "11:00:00",
            closingTime: "21:00:00",
            note: `Auto split ${runId} (edited)`,
          });
          expect(noted.status, JSON.stringify(noted.data)).toBe(200);
          expect(noted.data.data).toMatchObject({
            note: `Auto split ${runId} (edited)`,
            windows: [brunch, supper],
          });
          const single = await special("PUT", ids[0], {
            date,
            isClosed: false,
            openingTime: "11:00:00",
            closingTime: "21:00:00",
            windows: null,
          });
          expect(single.status, JSON.stringify(single.data)).toBe(200);
          expect(single.data.data).toMatchObject({
            openingTime: "11:00:00",
            closingTime: "21:00:00",
            windows: null,
          });
        }
      );

      await allure.step(
        "a split TODAY closes the break, whatever the weekly hours say",
        async () => {
          // Weekly hours say open now; today's special hours put now in a break.
          await saveToday("first");
          expect((await status()).isOpenByHours).toBe(true);
          const plan = splitDayAroundNow(timeZone, "break");
          test.skip(!plan, NO_ROOM_FOR_SPLIT_DAY);
          const todayRow = await special("POST", undefined, {
            date: plan!.dateKey,
            isClosed: false,
            note: `Auto split today ${runId}`,
            windows: plan!.windows,
          });
          expect(todayRow.status, JSON.stringify(todayRow.data)).toBe(201);
          ids.push(String((todayRow.data.data as Rec).id));
          const opens = clock(plan!.second.startMinute);
          const now = await status();
          expect(now).toMatchObject({
            state: "CLOSED_BY_HOURS",
            isOpenByHours: false,
            todaySpecial: { isClosed: false, windows: plan!.windows },
          });
          expect(normalizeSpaces(String(now.headline))).toBe(
            `Closed · Opens ${opens}`
          );
          const asap = await order(null);
          expect(asap.status, JSON.stringify(asap.data)).toBe(400);
          expect(normalizeSpaces(String(asap.data.message))).toBe(
            `This restaurant is closed right now. It opens again at ${opens}.`
          );
        }
      );
    } finally {
      // Today's special hours would close the break for the tests after this.
      // No assertion in here: it would replace the failure that got us here.
      for (const id of ids) deleted.push((await special("DELETE", id)).status);
    }
    expect(deleted).toEqual(ids.map(() => 200));
    expect(await listed()).toEqual([]);
    expect((await status()).isOpenByHours).toBe(true);
  });

  test("TC-2007: the public reads carry each day's windows", async () => {
    const plan = await saveToday("break");
    const todayRow = {
      day: plan.dayName,
      openingTime: plan.windows[0]!.openingTime,
      closingTime: plan.windows[1]!.closingTime,
      isClosed: false,
      is24Hours: false,
      windows: plan.windows,
    };
    const otherDay = DAY_NAMES.find((d) => d !== plan.dayName)!;

    await allure.step("the ordering sites' restaurant read", async () => {
      const res = await apiRequestRaw<{
        restaurant?: { businessHours?: BusinessHoursRow[] };
      }>("GET", `/api/order/restaurantId/${restaurantId}`);
      expect(res.status, JSON.stringify(res.data).slice(0, 300)).toBe(200);
      const rows = res.data.restaurant?.businessHours ?? [];
      expect(rows).toHaveLength(7);
      expect(rows.find((r) => r.day === plan.dayName)).toMatchObject(todayRow);
      expect(rows.find((r) => r.day === otherDay)).toMatchObject({
        openingTime: "12:00:00",
        closingTime: "22:00:00",
        windows: [LUNCH, DINNER],
      });
    });

    await allure.step("the ordering app's restaurant details", async () => {
      const res = await apiRequestRaw<{
        data?: { hours?: BusinessHoursRow[]; currentStatus?: Rec };
      }>("GET", `/restaurant/${restaurantId}/details`);
      expect(res.status, JSON.stringify(res.data).slice(0, 300)).toBe(200);
      const hours = res.data.data?.hours ?? [];
      expect(hours.find((r) => r.day === plan.dayName)).toMatchObject(todayRow);
      expect(hours.find((r) => r.day === otherDay)).toMatchObject({
        windows: [LUNCH, DINNER],
      });
      const current = res.data.data?.currentStatus ?? {};
      expect(current.isOpen).toBe(false);
      // The next window today, not tomorrow's first opening.
      expect(normalizeSpaces(String(current.message))).toBe(
        `Opens ${clock(plan.second.startMinute)}`
      );
    });
  });
});
