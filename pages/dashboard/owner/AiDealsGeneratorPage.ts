import { type Page, type Locator } from "@playwright/test";

/**
 * AIDealsGenerator.tsx (`?tab=ai-deals`): step 0 questionnaire rendered from
 * the public GET /api/deals/ai/questions (radios named by their option label),
 * "Generate Deals" → POST /api/deals/ai/generate/:id (PAID — specs must stub
 * it with page.route) → job polled at GET /api/jobs/:jobId/status → review
 * cards. Deal scheduling (#898): each card shows the suggested schedule
 * (`ai-deal-schedule`) and "Edit before saving", which opens DealForm
 * pre-filled — after the confirm "Edit this suggestion?" (Edit / Keep
 * suggestions) when more than one suggestion is on screen.
 */
export const createAiDealsGeneratorPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: "AI Deal Generator", level: 1 });
  const radio = (label: string): Locator =>
    page.getByRole("radio", { name: new RegExp(`^${label}`) });
  const generateButton = () =>
    page.getByRole("button", { name: "Generate Deals" });
  const card = (dealName: string): Locator =>
    page
      .getByTestId("ai-deal-card")
      .or(page.locator(".MuiCard-root"))
      .filter({ hasText: dealName })
      .first();
  const cardSchedule = (dealName: string) =>
    card(dealName).getByTestId("ai-deal-schedule");
  const cardEdit = (dealName: string) =>
    card(dealName).getByRole("button", {
      name: "Edit before saving",
      exact: true,
    });
  const editConfirmDialog = () =>
    page.getByRole("dialog", { name: "Edit this suggestion?" });
  const editConfirmButton = () =>
    editConfirmDialog().getByRole("button", { name: "Edit", exact: true });
  const keepSuggestionsButton = () =>
    editConfirmDialog().getByRole("button", {
      name: "Keep suggestions",
      exact: true,
    });

  return {
    heading,
    radio,
    generateButton,
    card,
    cardSchedule,
    cardEdit,
    editConfirmDialog,
    editConfirmButton,
    keepSuggestionsButton,
  };
};

export type AiDealsGeneratorPage = ReturnType<
  typeof createAiDealsGeneratorPage
>;
