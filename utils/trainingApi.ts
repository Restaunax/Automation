/**
 * trainingApi.ts — Training Academy API helpers (RestauNax feat/training-academy).
 *
 * Learner routes: /api/training/* (any signed-in user; access comes from
 * having an assignment). HQ routes: /api/admin/training/* (permission
 * HQ_PEOPLE_TRAINING, granted to ADMIN). Every success body is
 * `{ success: true, data }`.
 *
 * Module content lives in the RestauNax repo and is seeded per environment,
 * so specs DISCOVER modules at runtime (status, sections with a quick check,
 * narration) instead of hardcoding ids.
 */
import { apiRequestRaw, type RawResponse } from "./apiHelper";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  problems?: string[];
}

export interface AdminModuleSummary {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  passMarkPercent: number;
  questionsPerQuiz: number;
  sectionCount: number;
  questionCount: number;
  openFlagCount: number;
}

export interface AdminSection {
  id: string;
  sortOrder: number;
  heading: string;
  body: string;
  narrationUrl: string | null;
  checkPrompt: string | null;
  checkChoices: string[];
  checkCorrect: number[];
}

export interface AdminQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correct: number[];
}

export interface AdminFlag {
  id: string;
  sectionId: string;
  note: string | null;
}

export interface AdminModuleDetail extends AdminModuleSummary {
  sections: AdminSection[];
  questions: AdminQuestion[];
  flags: AdminFlag[];
}

export interface AdminJobTitle {
  id: string;
  name: string;
  archivedAt: string | null;
  holderCount: number;
  path: Array<{ moduleId: string; required: boolean; status: string }>;
}

export interface MyAssignment {
  id: string;
  moduleId: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "PASSED" | "NEEDS_RETAKE";
  required: boolean;
  bestScorePercent: number | null;
}

export interface MyTraining {
  jobTitle: { id: string; name: string } | null;
  assignments: MyAssignment[];
}

export interface CatalogueEntry {
  moduleId: string;
  title: string;
  assignment: { required: boolean; status: string } | null;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  multiple: boolean;
}

const unwrap = <T>(res: RawResponse<Envelope<T>>, what: string): T => {
  if (!res.ok || res.data?.data === undefined) {
    throw new Error(`${what} → ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data as T;
};

// ── HQ (admin) ───────────────────────────────────────────────────────────────

export async function listTrainingModulesAdmin(
  adminToken: string
): Promise<AdminModuleSummary[]> {
  return unwrap(
    await apiRequestRaw<Envelope<AdminModuleSummary[]>>(
      "GET",
      "/api/admin/training/modules",
      undefined,
      adminToken
    ),
    "GET /api/admin/training/modules"
  );
}

export async function getTrainingModuleAdmin(
  adminToken: string,
  moduleId: string
): Promise<AdminModuleDetail> {
  return unwrap(
    await apiRequestRaw<Envelope<AdminModuleDetail>>(
      "GET",
      `/api/admin/training/modules/${moduleId}`,
      undefined,
      adminToken
    ),
    `GET /api/admin/training/modules/${moduleId}`
  );
}

export async function listJobTitlesAdmin(
  adminToken: string
): Promise<AdminJobTitle[]> {
  return unwrap(
    await apiRequestRaw<Envelope<AdminJobTitle[]>>(
      "GET",
      "/api/admin/training/job-titles",
      undefined,
      adminToken
    ),
    "GET /api/admin/training/job-titles"
  );
}

/**
 * Find-or-create a job title by exact name, un-archiving nothing: an archived
 * title of the same name is reused as-is (the name is unique). Specs use ONE
 * persistent "AUTO …" title and reset its path afterwards, so runs do not
 * pile up titles on QA (titles can only be archived, never deleted).
 */
export async function ensureJobTitle(
  adminToken: string,
  name: string
): Promise<AdminJobTitle> {
  const existing = (await listJobTitlesAdmin(adminToken)).find(
    (t) => t.name === name
  );
  if (existing) return existing;
  unwrap(
    await apiRequestRaw<Envelope<{ id: string }>>(
      "POST",
      "/api/admin/training/job-titles",
      { name, description: "Automation fixture — safe to ignore" },
      adminToken
    ),
    "POST /api/admin/training/job-titles"
  );
  const created = (await listJobTitlesAdmin(adminToken)).find(
    (t) => t.name === name
  );
  if (!created) throw new Error(`job title "${name}" not found after create`);
  return created;
}

export function setJobTitlePathRaw(
  adminToken: string,
  jobTitleId: string,
  entries: Array<{ moduleId: string; required: boolean }>
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "PUT",
    `/api/admin/training/job-titles/${jobTitleId}/path`,
    { entries },
    adminToken
  );
}

export function setUserJobTitleRaw(
  adminToken: string,
  userId: string,
  jobTitleId: string | null
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/api/admin/training/users/${userId}/job-title`,
    { jobTitleId },
    adminToken
  );
}

export function resolveTrainingFlagRaw(
  adminToken: string,
  flagId: string
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/admin/training/flags/${flagId}/resolve`,
    {},
    adminToken
  );
}

/** HQ module detail → the open flags whose note contains `marker`. */
export async function findFlagsByNote(
  adminToken: string,
  moduleId: string,
  marker: string
): Promise<AdminFlag[]> {
  const mod = await getTrainingModuleAdmin(adminToken, moduleId);
  return mod.flags.filter((f) => (f.note ?? "").includes(marker));
}

// ── Learner ──────────────────────────────────────────────────────────────────

export async function getMyTraining(accessToken: string): Promise<MyTraining> {
  return unwrap(
    await apiRequestRaw<Envelope<MyTraining>>(
      "GET",
      "/api/training/me",
      undefined,
      accessToken
    ),
    "GET /api/training/me"
  );
}

export async function getTrainingCatalogue(
  accessToken: string
): Promise<CatalogueEntry[]> {
  return unwrap(
    await apiRequestRaw<Envelope<CatalogueEntry[]>>(
      "GET",
      "/api/training/catalogue",
      undefined,
      accessToken
    ),
    "GET /api/training/catalogue"
  );
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface PickedModule {
  detail: AdminModuleDetail;
  /** Index of the first section with a quick check, or -1. */
  checkSectionIndex: number;
  /** Index of the first narrated section, or -1. */
  narratedSectionIndex: number;
  /** The question pool is big enough to draw a quiz. */
  quizReady: boolean;
}

/**
 * Pick a module for a player/quiz spec: the first (by the server's order)
 * whose status is in `statuses` and that has a quick check and a quiz pool,
 * preferring one with narration (Watch mode needs it). Returns null when the
 * environment has none.
 */
export async function pickTrainingModule(
  adminToken: string,
  statuses: AdminModuleSummary["status"][]
): Promise<PickedModule | null> {
  const candidates = (await listTrainingModulesAdmin(adminToken)).filter(
    (m) =>
      statuses.includes(m.status) &&
      m.sectionCount > 0 &&
      m.questionCount >= m.questionsPerQuiz
  );
  let fallback: PickedModule | null = null;
  for (const m of candidates) {
    const detail = await getTrainingModuleAdmin(adminToken, m.id);
    const picked: PickedModule = {
      detail,
      checkSectionIndex: detail.sections.findIndex(
        (s) => !!s.checkPrompt && s.checkCorrect.length > 0
      ),
      narratedSectionIndex: detail.sections.findIndex((s) => !!s.narrationUrl),
      quizReady: detail.questions.length >= detail.questionsPerQuiz,
    };
    if (picked.checkSectionIndex < 0 || !picked.quizReady) continue;
    if (picked.narratedSectionIndex === 0) return picked;
    fallback ??= picked;
  }
  return fallback;
}

/** A section's quick-check answer, as choice texts. */
export const checkAnswerOf = (s: {
  checkChoices: string[];
  checkCorrect: number[];
}): string[] => s.checkCorrect.map((i) => s.checkChoices[i] ?? "");
