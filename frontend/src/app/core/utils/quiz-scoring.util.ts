export type ScoringMode = 'default' | 'custom';
export type PenaltyMode = 'fraction' | 'points' | 'percent';

export interface QuizScoring {
  mode: ScoringMode;
  allowNegativeScore: boolean;
  pointsPerCorrect: number;
  incorrectPenalty: number;
  penaltyMode: PenaltyMode;
}

export interface ScorableAnswer {
  id?: number;
  correct: boolean;
  points?: number | null;
}

const MAX_SCORE_VALUE = 99.99;

export const DEFAULT_QUIZ_SCORING: QuizScoring = {
  mode: 'default',
  allowNegativeScore: false,
  pointsPerCorrect: 1,
  incorrectPenalty: 1,
  penaltyMode: 'fraction',
};

/** Modes must match QuizService; fraction = share points, points/percent = per pick, custom = sum option points. */
export function questionMaxScore(answers: readonly ScorableAnswer[], scoring: QuizScoring): number {
  if (scoring.mode === 'custom') {
    return answers.reduce((total, answer) => total + Math.max(0, finiteOrZero(answer.points)), 0);
  }

  const pointsPerCorrect = Math.max(0, scoring.pointsPerCorrect);
  const correctCount = answers.filter((answer) => answer.correct).length;

  // no correct markers → 0 (QuizService.maxQuestionScore).
  if (scoring.penaltyMode === 'fraction') {
    return correctCount === 0 ? 0 : pointsPerCorrect;
  }

  return pointsPerCorrect * correctCount;
}

export function awardedQuestionScore(
  answers: readonly ScorableAnswer[],
  selectedIds: readonly number[],
  scoring: QuizScoring,
): number {
  const raw = rawQuestionScore(answers, selectedIds, scoring);

  if (!scoring.allowNegativeScore && raw < 0) {
    return 0;
  }

  return raw;
}

export function normalizeQuizScoring(value: unknown): QuizScoring {
  if (!isRecord(value)) {
    return { ...DEFAULT_QUIZ_SCORING };
  }

  const modeValue = typeof value['mode'] === 'string' ? value['mode'].trim().toLowerCase() : 'default';
  const penaltyValue = typeof value['penaltyMode'] === 'string' ? value['penaltyMode'].trim().toLowerCase() : 'fraction';

  return {
    mode: modeValue === 'custom' ? 'custom' : 'default',
    allowNegativeScore: value['allowNegativeScore'] === true,
    pointsPerCorrect: nonNegativeOr(value['pointsPerCorrect'], DEFAULT_QUIZ_SCORING.pointsPerCorrect),
    incorrectPenalty: nonNegativeOr(value['incorrectPenalty'], DEFAULT_QUIZ_SCORING.incorrectPenalty),
    penaltyMode: penaltyValue === 'points' || penaltyValue === 'percent' ? penaltyValue : 'fraction',
  };
}

export function parseQuizScoring(value: unknown): QuizScoring {
  if (value === undefined || value === null) {
    return { ...DEFAULT_QUIZ_SCORING };
  }

  if (!isRecord(value)) {
    throw new Error('Pole scoring musi być obiektem.');
  }

  const mode = readEnum(value['mode'], ['default', 'custom'], 'scoring.mode');
  const penaltyMode = readEnum(value['penaltyMode'], ['fraction', 'points', 'percent'], 'scoring.penaltyMode');
  const allowNegativeScore = value['allowNegativeScore'];

  if (allowNegativeScore !== undefined && typeof allowNegativeScore !== 'boolean') {
    throw new Error('Pole scoring.allowNegativeScore musi być typu boolean.');
  }

  const normalizedPenaltyMode = penaltyMode === 'points' || penaltyMode === 'percent' ? penaltyMode : 'fraction';

  if (normalizedPenaltyMode === 'fraction') {
    return {
      mode: mode === 'custom' ? 'custom' : 'default',
      allowNegativeScore: allowNegativeScore === true,
      pointsPerCorrect: 1,
      incorrectPenalty: 1,
      penaltyMode: 'fraction',
    };
  }

  return {
    mode: mode === 'custom' ? 'custom' : 'default',
    allowNegativeScore: allowNegativeScore === true,
    pointsPerCorrect: readScore(value['pointsPerCorrect'], 1, 'Pole scoring.pointsPerCorrect', 0, MAX_SCORE_VALUE),
    incorrectPenalty: readScore(value['incorrectPenalty'], 1, 'Pole scoring.incorrectPenalty', 0, MAX_SCORE_VALUE),
    penaltyMode: normalizedPenaltyMode,
  };
}

/** Points limits match editor/MapperDTO (0–99.99 / −99.99–0, 2 decimals). */
export function parseAnswerPoints(value: unknown, label: string, correct: boolean): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return correct
    ? readScore(value, 0, label, 0, MAX_SCORE_VALUE)
    : readScore(value, 0, label, -MAX_SCORE_VALUE, 0);
}

function rawQuestionScore(
  answers: readonly ScorableAnswer[],
  selectedIds: readonly number[],
  scoring: QuizScoring,
): number {
  const selected = new Set(selectedIds);

  if (scoring.mode === 'custom') {
    return answers.reduce((total, answer) => {
      if (answer.id === undefined || !selected.has(answer.id)) {
        return total;
      }

      return total + finiteOrZero(answer.points);
    }, 0);
  }

  const correctAnswers = answers.filter((answer) => answer.correct);
  const wrongAnswers = answers.filter((answer) => !answer.correct);
  const correctSelected = correctAnswers.filter((answer) => answer.id !== undefined && selected.has(answer.id)).length;
  const wrongSelected = wrongAnswers.filter((answer) => answer.id !== undefined && selected.has(answer.id)).length;
  const pointsPerCorrect = Math.max(0, scoring.pointsPerCorrect);
  const penaltyAmount = Math.max(0, scoring.incorrectPenalty);
  const reward =
    scoring.penaltyMode === 'fraction'
      ? correctAnswers.length === 0
        ? 0
        : pointsPerCorrect * (correctSelected / correctAnswers.length)
      : pointsPerCorrect * correctSelected;
  const penalty =
    scoring.penaltyMode === 'fraction'
      ? wrongAnswers.length === 0
        ? 0
        : penaltyAmount * (wrongSelected / wrongAnswers.length)
      : scoring.penaltyMode === 'percent'
        ? reward * (penaltyAmount / 100) * wrongSelected
        : penaltyAmount * wrongSelected;

  return Math.min(questionMaxScore(answers, scoring), reward - penalty);
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Pole ${label} ma niedozwoloną wartość.`);
  }

  const normalized = value.trim().toLowerCase();
  const match = allowed.find((item) => item === normalized);

  if (!match) {
    throw new Error(`Pole ${label} musi mieć wartość: ${allowed.join(', ')}.`);
  }

  return match;
}

function readScore(value: unknown, fallback: number, label: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = readFinite(value);

  if (parsed === null) {
    throw new Error(`${label} musi być liczbą.`);
  }

  if (Math.abs(Math.round(parsed * 100) - parsed * 100) > 1e-9) {
    throw new Error(`${label} może mieć maksymalnie dwie cyfry po przecinku.`);
  }

  if (parsed < min || parsed > max) {
    throw new Error(`${label} musi mieścić się w zakresie ${formatScoreLimit(min)}–${formatScoreLimit(max)}.`);
  }

  return parsed;
}

function formatScoreLimit(value: number): string {
  return String(value).replace('.', ',');
}

function nonNegativeOr(value: unknown, fallback: number): number {
  const parsed = readFinite(value);

  if (parsed === null || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function readFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
