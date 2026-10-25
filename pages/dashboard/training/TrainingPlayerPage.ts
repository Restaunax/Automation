import { type Page, type Response, expect } from "@playwright/test";

/**
 * Training Academy learner screens (RestauNax feat/training-academy):
 *   /training                       — My training + "Browse all courses"
 *   /training/modules/:id[/quiz]    — the module player and its quiz
 *   /training/preview/:id[/quiz]    — the same player for HQ reviewers, under
 *                                     the "nothing counts" banner
 *
 * The components carry no data-testids; every string below is the English
 * value from restaunax-frontend/public/locales/en/training.json.
 */
export const createTrainingPlayerPage = (page: Page) => {
  // ── Home + catalogue ──────────────────────────────────────────────────────
  const gotoHome = async (view: "mine" | "all" = "mine") => {
    await page.goto(view === "all" ? "/training?view=all" : "/training", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "My Training" })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
  };

  const tab = (name: "My training" | "Browse all courses") =>
    page.getByRole("tab", { name, exact: true });

  /** A catalogue / home card, by the module's title. */
  const card = (title: string) =>
    page.locator(".MuiCard-root").filter({ hasText: title }).first();

  // ── Player ────────────────────────────────────────────────────────────────
  const gotoModule = async (moduleId: string, preview = false) => {
    await page.goto(
      preview
        ? `/training/preview/${moduleId}`
        : `/training/modules/${moduleId}`,
      { waitUntil: "domcontentloaded" }
    );
    // The player is a lazy route chunk (it carries the Remotion player).
    await viewToggle("read").waitFor({ state: "visible", timeout: 30_000 });
  };

  const previewBanner = () =>
    page
      .getByRole("alert")
      .filter({ hasText: "Draft preview — nothing you do here counts" });

  const viewToggle = (mode: "watch" | "read") =>
    page
      .getByRole("group", { name: "Lesson view" })
      .getByRole("button", { name: mode === "watch" ? "Watch" : "Read" });

  const chooseView = async (mode: "watch" | "read") => {
    const button = viewToggle(mode);
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  };

  const sectionHeading = () => page.getByRole("heading", { level: 1 });
  const sectionCounter = (current: number, total: number) =>
    page.getByText(`Section ${current} of ${total}`);

  /** Watch view: the photo frame's play button, or the lesson video's. */
  const watchPlayButton = () =>
    page
      .getByRole("button", { name: "Play lesson" })
      .or(page.getByRole("button", { name: "Play video" }))
      .first();
  const watchPauseButton = () =>
    page
      .getByRole("button", { name: "Pause lesson" })
      .or(page.getByRole("button", { name: "Pause video" }))
      .first();
  const captions = () => page.getByRole("region", { name: "Captions" }).first();

  const nextButton = () =>
    page.getByRole("button", { name: "Next", exact: true });
  const goToQuizButton = () =>
    page.getByRole("button", { name: "Go to quiz", exact: true });

  // ── Quick check ───────────────────────────────────────────────────────────
  /** Pick the given choices of the visible quick check and press Check. */
  const answerQuickCheck = async (choices: string[], multiple: boolean) => {
    for (const choice of choices) {
      const control = multiple
        ? page.getByRole("checkbox", { name: choice, exact: true })
        : page.getByRole("radio", { name: choice, exact: true });
      await control.check();
    }
    await page.getByRole("button", { name: "Check answer" }).click();
  };
  const quickCheckFeedback = () =>
    page.getByRole("alert").filter({ hasText: /^(Correct!|Not quite\.)/ });

  /**
   * From section 0, walk to section `target` in Read view (Read always shows
   * the quick check), answering each earlier section's check correctly —
   * Next stays disabled until it is answered. `sections` is the HQ module
   * detail's section list (it carries the correct choices).
   */
  const walkToSection = async (
    target: number,
    sections: Array<{ checkChoices: string[]; checkCorrect: number[] }>
  ) => {
    await chooseView("read");
    for (let i = 0; i < target; i++) {
      const s = sections[i];
      if (s && s.checkCorrect.length > 0) {
        await answerQuickCheck(
          s.checkCorrect.map((c) => s.checkChoices[c] ?? ""),
          s.checkCorrect.length > 1
        );
        await expect(quickCheckFeedback()).toBeVisible();
      }
      await nextButton().click();
      await expect(sectionCounter(i + 2, sections.length)).toBeVisible();
    }
  };

  // ── Flag ──────────────────────────────────────────────────────────────────
  const flagSection = async (note: string) => {
    await page.getByRole("button", { name: "This was confusing" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#training-flag-note").fill(note);
    const resp = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/sections\/[^/]+\/flag$/.test(r.url())
    );
    await dialog.getByRole("button", { name: "Send" }).click();
    return resp;
  };
  const flagSent = () =>
    page.getByText("Thanks — we'll use this to improve the module.");

  // ── Quiz ──────────────────────────────────────────────────────────────────
  /**
   * Open the quiz with `open` (a navigation or the "Go to quiz" click): the
   * quiz screen starts an attempt on mount, so this returns the drawn
   * questions from that start response (learner: POST …/attempts →
   * {attemptId, questions}; preview: POST …/preview/modules/:id/quiz →
   * {questions}). The learner's start answers 409 QUIZ_LOCKED until every
   * section has been reached.
   */
  const openQuiz = async (
    open: () => Promise<unknown>
  ): Promise<
    Array<{ id: string; prompt: string; choices: string[]; multiple: boolean }>
  > => {
    const started = page.waitForResponse(
      (r: Response) =>
        r.request().method() === "POST" &&
        (/\/api\/training\/modules\/[^/]+\/attempts$/.test(r.url()) ||
          /\/api\/admin\/training\/preview\/modules\/[^/]+\/quiz$/.test(
            r.url()
          )),
      { timeout: 30_000 }
    );
    await open();
    const res = await started;
    expect(res.status(), "quiz start").toBe(200);
    const body = (await res.json()) as {
      data: {
        questions: Array<{
          id: string;
          prompt: string;
          choices: string[];
          multiple: boolean;
        }>;
      };
    };
    return body.data.questions;
  };

  /** Answer the CURRENT question by choice text, then go on. */
  const answerQuizQuestion = async (choices: string[], multiple: boolean) => {
    for (const choice of choices) {
      const control = multiple
        ? page.getByRole("checkbox", { name: choice, exact: true })
        : page.getByRole("radio", { name: choice, exact: true });
      await control.check();
    }
  };
  /**
   * Answer every drawn question correctly, reading each question off the
   * screen and looking it up in the HQ pool by its prompt. Driven by the DOM,
   * not the start response: a dev build (React StrictMode) starts the quiz
   * twice and shows the second draw.
   */
  const answerQuizFromPool = async (
    pool: Array<{ prompt: string; choices: string[]; correct: number[] }>,
    total: number
  ) => {
    for (let i = 0; i < total; i++) {
      await expect(
        page.getByText(`Question ${i + 1} of ${total}`)
      ).toBeVisible();
      let shown: (typeof pool)[number] | undefined;
      for (const q of pool) {
        if (await page.getByText(q.prompt, { exact: true }).isVisible()) {
          shown = q;
          break;
        }
      }
      if (!shown) throw new Error(`question ${i + 1}: prompt not in the pool`);
      await answerQuizQuestion(
        shown.correct.map((c) => shown.choices[c] ?? ""),
        shown.correct.length > 1
      );
      if (i < total - 1) await nextButton().click();
    }
  };
  const submitQuiz = () =>
    page.getByRole("button", { name: "Submit answers" }).click();
  const quizResultTitle = () =>
    page.getByText(/^(You passed!|Not this time)$/).first();

  return {
    gotoHome,
    tab,
    card,
    gotoModule,
    previewBanner,
    viewToggle,
    chooseView,
    sectionHeading,
    sectionCounter,
    watchPlayButton,
    watchPauseButton,
    captions,
    nextButton,
    goToQuizButton,
    answerQuickCheck,
    quickCheckFeedback,
    walkToSection,
    flagSection,
    flagSent,
    openQuiz,
    answerQuizQuestion,
    answerQuizFromPool,
    submitQuiz,
    quizResultTitle,
  };
};

export type TrainingPlayerPage = ReturnType<typeof createTrainingPlayerPage>;
