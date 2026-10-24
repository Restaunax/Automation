/**
 * training-learner.spec.ts — the Training Academy as a learner sees it
 * (RestauNax feat/training-academy): /training (My training + "Browse all
 * courses"), the module player, its quick checks and a scored quiz.
 *
 * TC-924..927. A learner is any signed-in user with a job title or an
 * assignment (their account role stays USER), so the file registers ONE
 * fresh user (recorded for globalTeardown's user sweep), gives them the
 * persistent "AUTO Training Learners" title whose path holds one PUBLISHED
 * module, and logs in as them through the UI.
 *
 * Two gates, both skip-with-reason:
 *   1. The training branch must be deployed (RELEASED_ON_QA.training).
 *   2. A PUBLISHED module must exist. Today all modules are DRAFT pending
 *      content review — assignments, the catalogue and real quiz attempts
 *      only exist for published modules — so these tests run once the first
 *      module is published. The HQ preview spec (training-hq.spec.ts) covers
 *      the player and quiz on drafts meanwhile.
 *
 * Cleanup: the title loses the learner and its path; the learner account is
 * deleted by globalTeardown (erasure scrubs their training rows).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createTrainingPlayerPage } from "../../../pages/dashboard/training/TrainingPlayerPage";
import { apiLogin, register } from "../../../utils/apiHelper";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  generateUserEmail,
  recordUserForCleanup,
} from "../../../utils/testData";
import { probeTraining, requireRelease } from "../../../utils/releaseGate";
import {
  checkAnswerOf,
  ensureJobTitle,
  getMyTraining,
  getTrainingCatalogue,
  listTrainingModulesAdmin,
  pickTrainingModule,
  setJobTitlePathRaw,
  setUserJobTitleRaw,
  type PickedModule,
} from "../../../utils/trainingApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const LEARNER_TITLE = "AUTO Training Learners";
const LEARNER_PASSWORD = "Automation!Learner-1";

test.describe("Learner — Training Academy", { tag: "@training" }, () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file registers its own learner)"
  );

  let adminToken = "";
  let deployed = false;
  /** The path module: published, with a quick check and a quiz pool. */
  let pathModule: PickedModule | null = null;
  /** Another published module for the catalogue, if there is one. */
  let catalogueModuleId: string | null = null;
  let catalogueModuleTitle = "";
  let titleId = "";
  let learner: { id: string; email: string; token: string } | null = null;
  let session: UiLoginSession | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    deployed = await probeTraining(adminToken);
    if (!deployed) return;
    pathModule = await pickTrainingModule(adminToken, ["PUBLISHED"]);
    if (!pathModule) return;
    const other = (await listTrainingModulesAdmin(adminToken)).find(
      (m) => m.status === "PUBLISHED" && m.id !== pathModule?.detail.id
    );
    catalogueModuleId = other?.id ?? null;
    catalogueModuleTitle = other?.title ?? "";

    const title = await ensureJobTitle(adminToken, LEARNER_TITLE);
    titleId = title.id;
    const path = await setJobTitlePathRaw(adminToken, titleId, [
      { moduleId: pathModule.detail.id, required: true },
    ]);
    if (!path.ok) throw new Error(`[training] path save → ${path.status}`);

    const email = generateUserEmail("learner");
    recordUserForCleanup(email);
    const reg = await register({
      firstName: "Auto",
      lastName: "Learner",
      email,
      password: LEARNER_PASSWORD,
    });
    const login = await apiLogin(email, LEARNER_PASSWORD);
    learner = {
      id: reg.userId || login.userId,
      email,
      token: login.accessToken,
    };
    session = await loginViaUi(browser, email, LEARNER_PASSWORD);
  });

  test.afterAll(async () => {
    // Best-effort: the learner is deleted by globalTeardown anyway; these
    // only keep the persistent title tidy for the next run.
    // Re-login: a raw API token lives 15 minutes (utils/auth.ts).
    if (adminToken)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    if (learner)
      await setUserJobTitleRaw(adminToken, learner.id, null).catch(() => {});
    if (titleId)
      await setJobTitlePathRaw(adminToken, titleId, []).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    requireRelease("training", deployed);
    test.skip(
      !pathModule,
      "No PUBLISHED training module with a quick check and a quiz pool on this environment — every module is still DRAFT pending content review"
    );
    await allure.label("feature", "Training Academy (learner)");
    await allure.label("severity", "critical");
  });

  test("TC-924: a job title's path assigns its module — the learner sees it as Required on My training", async () => {
    await allure.description(
      "Giving a user a job title (PATCH /api/admin/training/users/:id/job-title) creates a TITLE_PATH " +
        "assignment for every published module on the title's path (rule 5 → rule 3). /api/training/me " +
        "returns it as required and the My training page shows its card with a Required chip."
    );
    const mod = (pathModule as PickedModule).detail;
    const page = (session as UiLoginSession).page;
    const player = createTrainingPlayerPage(page);

    await allure.step("Give the learner the title", async () => {
      const res = await setUserJobTitleRaw(
        adminToken,
        (learner as { id: string }).id,
        titleId
      );
      expect(res.status).toBe(200);
    });

    await allure.step("/api/training/me lists the path module", async () => {
      const me = await getMyTraining((learner as { token: string }).token);
      expect(me.jobTitle?.id).toBe(titleId);
      const a = me.assignments.find((x) => x.moduleId === mod.id);
      expect(a?.required).toBe(true);
      expect(a?.status).toBe("ASSIGNED");
    });

    await allure.step("My training shows the card", async () => {
      await player.gotoHome();
      await expect(page.getByText(`Your path: ${LEARNER_TITLE}`)).toBeVisible();
      const card = player.card(mod.title);
      await expect(card).toContainText("Required");
      await expect(card.getByRole("button", { name: "Start" })).toBeVisible();
    });
  });

  test("TC-925: Browse all courses — Start enrols in another published module as Optional and opens it", async () => {
    await allure.description(
      "The catalogue (GET /api/training/catalogue) lists every PUBLISHED module for someone in training. " +
        "Start calls POST /api/training/modules/:id/enrol and opens the player; the learner now holds the " +
        "module as optional (SELF), with no due date."
    );
    test.skip(
      !catalogueModuleId,
      "Only one module is published here — nothing to enrol in beyond the path module"
    );
    const page = (session as UiLoginSession).page;
    const player = createTrainingPlayerPage(page);
    const token = (learner as { token: string }).token;

    const listed = await getTrainingCatalogue(token);
    expect(listed.map((e) => e.moduleId)).toContain(catalogueModuleId);

    await player.gotoHome("all");
    await expect(player.tab("Browse all courses")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const card = player.card(catalogueModuleTitle);
    const enrol = page.waitForResponse((r) =>
      r.url().endsWith(`/api/training/modules/${catalogueModuleId}/enrol`)
    );
    await card.getByRole("button", { name: "Start" }).click();
    expect((await enrol).status()).toBe(200);
    await expect(page).toHaveURL(
      new RegExp(`/training/modules/${catalogueModuleId}$`)
    );

    const me = await getMyTraining(token);
    const a = me.assignments.find((x) => x.moduleId === catalogueModuleId);
    expect(a?.required).toBe(false);
  });

  test("TC-926: module player — Read shows the text, Watch plays narration, the quick check answers 'Correct!'", async () => {
    await allure.description(
      "The learner opens the path module. Read view shows the section; Watch (when narrated) plays the " +
        "narration with captions; walking to the first section with a quick check and answering it " +
        "correctly says 'Correct!'. Progress is saved as the learner moves on (status IN_PROGRESS)."
    );
    const picked = pathModule as PickedModule;
    const mod = picked.detail;
    const page = (session as UiLoginSession).page;
    const player = createTrainingPlayerPage(page);
    await player.gotoModule(mod.id);
    await expect(player.previewBanner()).toHaveCount(0);

    if (picked.narratedSectionIndex === 0) {
      await allure.step("Watch plays the narration", async () => {
        await player.chooseView("watch");
        await player.watchPlayButton().click();
        await expect(player.watchPauseButton()).toBeVisible({
          timeout: 20_000,
        });
        await player.watchPauseButton().click();
      });
    }

    await allure.step("Read, then answer the quick check", async () => {
      await player.walkToSection(picked.checkSectionIndex, mod.sections);
      const s = mod.sections[picked.checkSectionIndex];
      if (!s) throw new Error("picked check section is missing");
      await expect(player.sectionHeading()).toHaveText(s.heading);
      await player.answerQuickCheck(
        checkAnswerOf(s),
        s.checkCorrect.length > 1
      );
      await expect(player.quickCheckFeedback()).toHaveText(/^Correct!/);
    });
  });

  test("TC-927: quiz — after reading every section, a full-marks attempt passes and is recorded (PASSED, best score 100%)", async () => {
    await allure.description(
      "POST /api/training/modules/:id/attempts draws the questions without answers; the test answers each " +
        "from the HQ pool and submits (POST /api/training/attempts/:id/submit). The result says 'You passed!' " +
        "and /api/training/me reports the assignment PASSED with bestScorePercent 100."
    );
    const mod = (pathModule as PickedModule).detail;
    const page = (session as UiLoginSession).page;
    const player = createTrainingPlayerPage(page);

    // The quiz unlocks once every section has been reached (409 QUIZ_LOCKED
    // before that): read through to the last section, then "Go to quiz".
    await player.gotoModule(mod.id);
    const last = mod.sections.length - 1;
    await player.walkToSection(last, mod.sections);
    const lastSection = mod.sections[last];
    if (lastSection && lastSection.checkCorrect.length > 0) {
      await player.answerQuickCheck(
        checkAnswerOf(lastSection),
        lastSection.checkCorrect.length > 1
      );
    }
    const questions = await player.openQuiz(() =>
      player.goToQuizButton().click()
    );
    expect(questions).toHaveLength(mod.questionsPerQuiz);
    await player.answerQuizFromPool(mod.questions, mod.questionsPerQuiz);
    const submitted = page.waitForResponse((r) =>
      /\/api\/training\/attempts\/[^/]+\/submit$/.test(r.url())
    );
    await player.submitQuiz();
    expect((await submitted).status()).toBe(200);
    await expect(player.quizResultTitle()).toHaveText("You passed!");

    const me = await getMyTraining((learner as { token: string }).token);
    const a = me.assignments.find((x) => x.moduleId === mod.id);
    expect(a?.status).toBe("PASSED");
    expect(a?.bestScorePercent).toBe(100);
  });
});
