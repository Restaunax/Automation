/**
 * training-hq.spec.ts — HQ → People → Training (RestauNax feat/training-academy).
 *
 * TC-918..923. The reviewer side of the Training Academy: the module list,
 * the draft **Preview** (the learner player + quiz under a "nothing you do
 * here counts" banner — every module is still DRAFT pending content review,
 * so this is the only way to drive the player today), a flag sent from the
 * preview, and a job-title path saved through the Job titles tab.
 *
 * Gated: until the training branch is merged and deployed, `/api/training`
 * answers 404 and every test here SKIPS with that reason (utils/releaseGate.ts
 * → RELEASED_ON_QA.training). Select with `--grep @training`.
 *
 * Data: the preview records nothing (no assignment, progress or attempt) —
 * TC-921 asserts that. The flag (TC-922) is resolved in a finally. The job
 * title (TC-923) is ONE persistent fixture, "AUTO Training Path", whose path
 * is reset to empty afterwards; titles can only be archived, so a per-run
 * title would pile up on QA.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createTrainingPlayerPage } from "../../../pages/dashboard/training/TrainingPlayerPage";
import { apiLogin } from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";
import { probeTraining, requireRelease } from "../../../utils/releaseGate";
import {
  checkAnswerOf,
  ensureJobTitle,
  findFlagsByNote,
  getMyTraining,
  listJobTitlesAdmin,
  listTrainingModulesAdmin,
  pickTrainingModule,
  resolveTrainingFlagRaw,
  setJobTitlePathRaw,
  type PickedModule,
} from "../../../utils/trainingApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/** Persistent fixture title — see the header. */
const PATH_TITLE = "AUTO Training Path";

const HQ_TRAINING = (sub: "modules" | "titles" | "people" | "overview") =>
  `/admin?tab=people&section=training&sub=${sub}`;

test.describe("HQ — Training Academy", { tag: "@training" }, () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  let adminToken = "";
  let deployed = false;
  /** A module with a quick check and a quiz pool, any status (preview). */
  let picked: PickedModule | null = null;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    deployed = await probeTraining(adminToken);
    if (deployed)
      picked = await pickTrainingModule(adminToken, ["DRAFT", "PUBLISHED"]);
  });

  test.beforeEach(async () => {
    requireRelease("training", deployed);
    await allure.label("feature", "Training Academy (HQ)");
    await allure.label("severity", "normal");
  });

  /** The picked module, or skip: an environment with no seeded content. */
  const requireModule = (): PickedModule => {
    test.skip(
      !picked,
      "No training module with a quick check and a full quiz pool is seeded here"
    );
    return picked as PickedModule;
  };

  test("TC-918: Modules tab lists the seeded modules; Preview opens the player under the 'nothing counts' banner", async ({
    adminPage,
  }) => {
    await allure.description(
      "HQ → People → Training → Modules renders one row per module from GET /api/admin/training/modules. " +
        "A row's Preview button opens /training/preview/:moduleId: the learner player with the " +
        "'Draft preview — nothing you do here counts' banner naming the module status."
    );
    const mod = requireModule().detail;
    const modules = await listTrainingModulesAdmin(adminToken);
    const player = createTrainingPlayerPage(adminPage);

    await allure.step("Open HQ → Training → Modules", async () => {
      await adminPage.goto(HQ_TRAINING("modules"), {
        waitUntil: "domcontentloaded",
      });
      await expect(
        adminPage.getByRole("tab", { name: "Modules", exact: true })
      ).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
      await expect(adminPage.locator("tbody tr")).toHaveCount(modules.length);
    });

    await allure.step(`Preview "${mod.title}"`, async () => {
      const row = adminPage.locator("tbody tr").filter({ hasText: mod.title });
      await row.getByRole("button", { name: "Preview" }).click();
      await expect(adminPage).toHaveURL(
        new RegExp(`/training/preview/${mod.id}$`)
      );
      // The player is a lazy route chunk (it carries the Remotion player).
      await expect(player.previewBanner()).toBeVisible({ timeout: 30_000 });
      // training.json → admin.moduleStatus.*
      const statusLabel = {
        DRAFT: "Draft",
        PUBLISHED: "Published",
        ARCHIVED: "Archived",
      }[mod.status];
      await expect(player.previewBanner()).toContainText(
        `Module status: ${statusLabel}.`
      );
      await expect(player.sectionHeading()).toHaveText(
        mod.sections[0]?.heading ?? ""
      );
    });
  });

  test("TC-919: preview player — Read shows the section text; Watch plays the narration with captions", async ({
    adminPage,
  }) => {
    await allure.description(
      "Read and Watch are the two views of a lesson. Read shows the section's text. Watch (enabled only " +
        "when the section has narration) shows the photo frame or the Remotion lesson video; pressing play " +
        "starts the narration (the button flips to Pause) and the sentence-synced caption region fills."
    );
    const { detail: mod, narratedSectionIndex } = requireModule();
    const player = createTrainingPlayerPage(adminPage);
    await player.gotoModule(mod.id, true);

    await allure.step("Read view shows the section body", async () => {
      await player.chooseView("read");
      const firstWords = (mod.sections[0]?.body ?? "")
        .replace(/^#.*$/m, "")
        .replace(/[*_`#>[\]()|]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join(" ");
      await expect(adminPage.getByText(firstWords).first()).toBeVisible();
    });

    test.skip(
      narratedSectionIndex !== 0,
      "The picked module's first section has no narration yet, so Watch is disabled (training:assets not run)"
    );

    await allure.step("Watch view plays the narration", async () => {
      await player.chooseView("watch");
      await player.watchPlayButton().click();
      await expect(player.watchPauseButton()).toBeVisible({ timeout: 20_000 });
      // The lesson video draws its own subtitles inside the frame; the photo
      // frame has the Captions region. Either way something is spoken.
      if (await player.captions().isVisible()) {
        await expect(player.captions()).not.toHaveText("", { timeout: 15_000 });
      }
      await player.watchPauseButton().click();
      await expect(player.watchPlayButton()).toBeVisible();
    });
  });

  test("TC-920: preview quick check — the correct answer says 'Correct!' and unlocks Next", async ({
    adminPage,
  }) => {
    await allure.description(
      "A section's quick check is ungraded: choosing the right answer(s) and pressing 'Check answer' " +
        "shows 'Correct!'. Next is disabled until the check is answered."
    );
    const { detail: mod, checkSectionIndex } = requireModule();
    const player = createTrainingPlayerPage(adminPage);
    await player.gotoModule(mod.id, true);
    await player.walkToSection(checkSectionIndex, mod.sections);

    const s = mod.sections[checkSectionIndex];
    if (!s) throw new Error("picked check section is missing");
    const isLast = checkSectionIndex === mod.sections.length - 1;
    const advance = isLast ? player.goToQuizButton() : player.nextButton();

    await allure.step("Next is blocked before answering", async () => {
      await expect(advance).toBeDisabled();
      await expect(
        adminPage.getByText("Answer the quick check to continue.")
      ).toBeVisible();
    });

    await allure.step("Answer correctly", async () => {
      await player.answerQuickCheck(
        checkAnswerOf(s),
        s.checkCorrect.length > 1
      );
      await expect(player.quickCheckFeedback()).toHaveText(/^Correct!/);
      await expect(advance).toBeEnabled();
    });
  });

  test("TC-921: preview quiz — answering every drawn question correctly passes, and nothing is recorded", async ({
    adminPage,
  }) => {
    await allure.description(
      "The preview quiz draws questionsPerQuiz questions WITHOUT answers (POST …/preview/modules/:id/quiz). " +
        "The test answers each from the HQ pool, submits (stateless grade) and gets 'You passed!'. " +
        "Afterwards the reviewer's own /api/training/me has no assignment for the module: a preview " +
        "records nothing."
    );
    const { detail: mod } = requireModule();
    const player = createTrainingPlayerPage(adminPage);
    const before = await getMyTraining(adminToken);

    const questions = await allure.step("Open the quiz", () =>
      player.openQuiz(() =>
        adminPage.goto(`/training/preview/${mod.id}/quiz`, {
          waitUntil: "domcontentloaded",
        })
      )
    );
    expect(questions).toHaveLength(mod.questionsPerQuiz);
    for (const q of questions) {
      expect(q, "answers never leave the server early").not.toHaveProperty(
        "correct"
      );
    }

    await allure.step("Answer every question correctly", () =>
      player.answerQuizFromPool(mod.questions, mod.questionsPerQuiz)
    );

    await allure.step("Submit → You passed!", async () => {
      const graded = adminPage.waitForResponse((r) =>
        r.url().endsWith(`/preview/modules/${mod.id}/quiz/grade`)
      );
      await player.submitQuiz();
      const body = (await (await graded).json()) as {
        data: { scorePercent: number; passed: boolean };
      };
      expect(body.data.passed).toBe(true);
      expect(body.data.scorePercent).toBe(100);
      await expect(player.quizResultTitle()).toHaveText("You passed!");
    });

    await allure.step("The preview recorded nothing", async () => {
      const after = await getMyTraining(adminToken);
      const had = before.assignments.some((a) => a.moduleId === mod.id);
      expect(after.assignments.some((a) => a.moduleId === mod.id)).toBe(had);
    });
  });

  test("TC-922: 'This was confusing' from the preview reaches HQ as an open flag on that section", async ({
    adminPage,
  }) => {
    await allure.description(
      "A reviewer flags a section from the preview (POST …/preview/sections/:id/flag). The flag works on a " +
        "draft without an assignment and shows on the module in HQ (GET /api/admin/training/modules/:id → " +
        "flags). Resolved afterwards."
    );
    const { detail: mod } = requireModule();
    const player = createTrainingPlayerPage(adminPage);
    const marker = `AUTO flag ${generateRunId()}`;
    await player.gotoModule(mod.id, true);

    try {
      await allure.step("Flag the first section", async () => {
        const res = await player.flagSection(marker);
        expect(res.status()).toBe(200);
        await expect(player.flagSent()).toBeVisible();
      });

      await allure.step("HQ sees the open flag", async () => {
        const flags = await findFlagsByNote(adminToken, mod.id, marker);
        expect(flags).toHaveLength(1);
        expect(flags[0]?.sectionId).toBe(mod.sections[0]?.id);
      });

      await allure.step("The HQ module detail shows it", async () => {
        await adminPage.goto(
          `/admin?tab=people&section=training&module=${mod.id}`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(adminPage.getByText(marker)).toBeVisible({
          timeout: 20_000,
        });
      });
    } finally {
      // Best-effort cleanup; a failure here must not mask the result above.
      for (const f of await findFlagsByNote(adminToken, mod.id, marker).catch(
        () => []
      )) {
        await resolveTrainingFlagRaw(adminToken, f.id).catch(() => {});
      }
    }
  });

  test("TC-923: Job titles — add a module to a title's path in the UI and Save path; the API returns that path", async ({
    adminPage,
  }) => {
    await allure.description(
      "On HQ → Training → Job titles, the persistent 'AUTO Training Path' card gets a module through " +
        "'Add module to path' → Add → 'Save path'. The success notice appears and GET /job-titles returns the " +
        "module on the title's path as required. (Assigning holders is covered in the learner spec, which " +
        "needs a PUBLISHED module.) The path is reset to empty afterwards."
    );
    const { detail: mod } = requireModule();
    const title = await ensureJobTitle(adminToken, PATH_TITLE);
    // Start from a known empty path.
    expect((await setJobTitlePathRaw(adminToken, title.id, [])).status).toBe(
      200
    );

    try {
      await adminPage.goto(HQ_TRAINING("titles"), {
        waitUntil: "domcontentloaded",
      });
      const card = adminPage
        .locator(".MuiPaper-root")
        .filter({ has: adminPage.getByRole("heading", { name: PATH_TITLE }) })
        .first();
      await expect(card).toBeVisible({ timeout: 20_000 });

      await allure.step(`Add "${mod.title}" and save`, async () => {
        await card.locator(`#jt-add-${title.id}`).click();
        await adminPage
          .getByRole("option", {
            name: new RegExp(`^${escapeRe(mod.title)} · `),
          })
          .click();
        await card.getByRole("button", { name: "Add", exact: true }).click();
        await card.getByRole("button", { name: "Save path" }).click();
        await expect(card.getByRole("alert")).toContainText("Path saved.");
      });

      await allure.step("The API returns the saved path", async () => {
        const saved = (await listJobTitlesAdmin(adminToken)).find(
          (t) => t.id === title.id
        );
        expect(saved?.path.map((p) => [p.moduleId, p.required])).toEqual([
          [mod.id, true],
        ]);
      });
    } finally {
      // Best-effort reset of the persistent fixture.
      await setJobTitlePathRaw(adminToken, title.id, []).catch(() => {});
    }
  });
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
