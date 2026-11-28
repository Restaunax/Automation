# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/19-promotions.spec.ts >> Owner — Promotions >> TC-853: Duplicate opens Create prefilled as a copy and saves nothing until asked
- Location: tests/dashboard/owner/19-promotions.spec.ts:776:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Promotions', exact: true, level: 1 })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Promotions', exact: true, level: 1 })

```

```yaml
- dialog "Leave without saving?":
  - heading "Leave without saving?" [level=2]
  - paragraph: Your answers on this page will be lost.
  - button "Keep editing"
  - button "Leave"
```

# Test source

```ts
  610 |     for (;;) {
  611 |       await waitForSlot();
  612 |       const posted = page.waitForResponse(
  613 |         (r) =>
  614 |           r.request().method() === "POST" &&
  615 |           /^\/api\/deals\/restaurant\/[^/]+$/.test(new URL(r.url()).pathname),
  616 |         { timeout: 30_000 }
  617 |       );
  618 |       await turnOnButton().click();
  619 |       // The form may refuse before posting (it marks answers instead): then
  620 |       // no POST ever comes, and expectSaved reports the marked form.
  621 |       const res = await Promise.race([
  622 |         posted,
  623 |         fixErrorsAlert()
  624 |           .waitFor({ state: "visible", timeout: 30_000 })
  625 |           .then(
  626 |             () => null,
  627 |             // No marked answers: leave the outcome to the POST wait (which
  628 |             // fails on its own when nothing is posted either).
  629 |             () => new Promise<never>(() => {})
  630 |           ),
  631 |       ]);
  632 |       if (!res) {
  633 |         // The POST wait is abandoned on purpose: the form never sent one.
  634 |         posted.catch(() => {});
  635 |         await settle();
  636 |         return;
  637 |       }
  638 |       const body = (await res.json().catch(() => ({}))) as { error?: string };
  639 |       const capped =
  640 |         res.status() === 400 && body.error === "MAX_ACTIVE_DEALS_REACHED";
  641 |       if (!capped || Date.now() > deadline) {
  642 |         await settle();
  643 |         return;
  644 |       }
  645 |       // The refusal is shown and the form keeps every answer: try again.
  646 |       await expect(serverErrorAlert()).toBeVisible();
  647 |       console.warn(
  648 |         "[OwnerCreatePromotionPage] Save and turn on refused at the deal cap — waiting for a slot and retrying"
  649 |       );
  650 |     }
  651 |   };
  652 | 
  653 |   /**
  654 |    * The create bar's paused save, "Save for later": the promotion is stored
  655 |    * INACTIVE (no deal slot used).
  656 |    */
  657 |   const saveForLaterButton = () =>
  658 |     page.getByRole("button", { name: "Save for later", exact: true });
  659 | 
  660 |   /** Create mode: save paused. Does not assert success — see expectSaved. */
  661 |   const saveForLater = async () => {
  662 |     await saveForLaterButton().click();
  663 |     await settle();
  664 |   };
  665 | 
  666 |   /** Edit mode: Save changes. */
  667 |   const save = async () => {
  668 |     await page
  669 |       .getByRole("button", { name: "Save changes", exact: true })
  670 |       .click();
  671 |     await settle();
  672 |   };
  673 | 
  674 |   /** The save went through and the page returned to the list. */
  675 |   const expectSaved = () => expect(listHeading()).toBeVisible();
  676 | 
  677 |   // "When?" rule: the shared schedule section (test ids come from the deal
  678 |   // schedule component the promotion form embeds).
  679 |   const scheduleChip = (
  680 |     chip: "any" | "lunch" | "breakfast" | "dinner" | "weekdays" | "weekends"
  681 |   ) => page.getByTestId(`deal-schedule-chip-${chip}`);
  682 |   const dayChip = (day: string) => page.getByTestId(`deal-day-chip-${day}`);
  683 |   const hoursWarning = () => page.getByTestId("deal-schedule-warning");
  684 |   const waitForScheduleCheck = (match: (url: string) => boolean) =>
  685 |     page.waitForResponse(
  686 |       (r) =>
  687 |         /\/schedule-check(\?|$)/.test(r.url()) &&
  688 |         r.request().method() === "GET" &&
  689 |         match(decodeURIComponent(r.url())),
  690 |       { timeout: 20_000 }
  691 |     );
  692 | 
  693 |   /** "Applies to all N locations of <chain>." on the chain create page. */
  694 |   const chainScopeLine = () =>
  695 |     page.getByText(/^Applies to (all )?\d+ location/);
  696 | 
  697 |   const expectFieldError = (text: string | RegExp) =>
  698 |     expect(page.getByText(text).first()).toBeVisible();
  699 | 
  700 |   /** Cancel; confirms "Leave without saving?" when the page asks. */
  701 |   const cancel = async () => {
  702 |     await page.getByRole("button", { name: "Cancel", exact: true }).click();
  703 |     const leave = page
  704 |       .getByRole("dialog")
  705 |       .filter({ hasText: "Leave without saving?" });
  706 |     await expect(listHeading().or(leave).first()).toBeVisible();
  707 |     if (await leave.isVisible()) {
  708 |       await leave.getByRole("button", { name: "Leave", exact: true }).click();
  709 |     }
> 710 |     await expect(listHeading()).toBeVisible();
      |                                 ^ Error: expect(locator).toBeVisible() failed
  711 |   };
  712 | 
  713 |   /** Duplicate opened Create as "Copy a promotion". */
  714 |   const expectDuplicating = () =>
  715 |     expect(
  716 |       page.getByRole("heading", { name: "Copy a promotion", level: 1 })
  717 |     ).toBeVisible({ timeout: 20_000 });
  718 | 
  719 |   const expectEditing = () =>
  720 |     expect(
  721 |       page.getByRole("heading", { name: "Edit promotion", level: 1 })
  722 |     ).toBeVisible({ timeout: 20_000 });
  723 | 
  724 |   return {
  725 |     goto,
  726 |     card,
  727 |     pickCard,
  728 |     pickGoal,
  729 |     exampleCards,
  730 |     useExample,
  731 |     expectTypeHint,
  732 |     expectSwitchConfirm,
  733 |     confirmSwitch,
  734 |     keepType,
  735 |     nameField,
  736 |     codeField,
  737 |     setName,
  738 |     setCode,
  739 |     amountField,
  740 |     setAmount,
  741 |     chooseOption,
  742 |     openRule,
  743 |     setHowCustomersGetIt,
  744 |     setWho,
  745 |     setWhere,
  746 |     setTimeOfDay,
  747 |     pickItems,
  748 |     addChoices,
  749 |     addOptionButton,
  750 |     groupTitles,
  751 |     groupNotes,
  752 |     categoryLineTitles,
  753 |     removeChoice,
  754 |     pickCategory,
  755 |     repeatLine,
  756 |     lineNames,
  757 |     changeLine,
  758 |     keepLine,
  759 |     pickReplacement,
  760 |     previewPanel,
  761 |     expectPreviewText,
  762 |     tryAsCustomerButton,
  763 |     tryAsCustomerHint,
  764 |     tryAsCustomerReason,
  765 |     previewFailedTitle,
  766 |     previewUnavailableNotice,
  767 |     previewBarToggle,
  768 |     previewBarBody,
  769 |     openPreviewBar,
  770 |     tryAsCustomer,
  771 |     settle,
  772 |     turnOn,
  773 |     turnOnButton,
  774 |     turnOnDealWhenSlotFree,
  775 |     saveForLater,
  776 |     saveForLaterButton,
  777 |     save,
  778 |     expectSaved,
  779 |     scheduleChip,
  780 |     dayChip,
  781 |     hoursWarning,
  782 |     waitForScheduleCheck,
  783 |     chainScopeLine,
  784 |     expectFieldError,
  785 |     expectEditing,
  786 |     expectDuplicating,
  787 |     cancel,
  788 |     fixErrorsAlert,
  789 |   };
  790 | };
  791 | 
  792 | export type OwnerCreatePromotionPage = ReturnType<
  793 |   typeof createOwnerCreatePromotionPage
  794 | >;
  795 | 
```