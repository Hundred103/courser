export interface QuizLimits {
  maxAttempts: number | null;
  quizTimeSeconds: number | null;
  questionTimeSeconds: number | null;
  randomQuestionOrder: boolean;
  showCorrectAnswers: boolean;
}

export const UNLIMITED_QUIZ_LIMITS: QuizLimits = {
  maxAttempts: null,
  quizTimeSeconds: null,
  questionTimeSeconds: null,
  randomQuestionOrder: false,
  showCorrectAnswers: true,
};

export function limitsAreActive(limits: QuizLimits | null | undefined): boolean {
  return !!limits && (limits.maxAttempts != null || limits.quizTimeSeconds != null || limits.questionTimeSeconds != null);
}

export function quizLimitsError(limits: QuizLimits, questionCount: number): string {
  if (
    limits.quizTimeSeconds != null &&
    limits.questionTimeSeconds != null &&
    limits.questionTimeSeconds * questionCount < limits.quizTimeSeconds
  ) {
    return 'Czas pytania pomnożony przez liczbę pytań musi być nie mniejszy niż czas całego quizu.';
  }

  return '';
}

export function normalizeQuizLimits(value: unknown): QuizLimits {
  if (!isRecord(value)) {
    return { ...UNLIMITED_QUIZ_LIMITS };
  }

  return {
    maxAttempts: optionalPositive(value['maxAttempts']),
    quizTimeSeconds: optionalPositive(value['quizTimeSeconds']),
    questionTimeSeconds: optionalPositive(value['questionTimeSeconds']),
    randomQuestionOrder: value['randomQuestionOrder'] === true,
    showCorrectAnswers: value['showCorrectAnswers'] !== false,
  };
}

export function parseQuizLimits(value: unknown): QuizLimits {
  if (value == null) {
    return { ...UNLIMITED_QUIZ_LIMITS };
  }

  if (!isRecord(value)) {
    throw new Error('Pole limits musi być obiektem.');
  }

  return {
    maxAttempts: strictOptionalPositive(value['maxAttempts'], 'limits.maxAttempts'),
    quizTimeSeconds: strictOptionalPositive(value['quizTimeSeconds'], 'limits.quizTimeSeconds'),
    questionTimeSeconds: strictOptionalPositive(value['questionTimeSeconds'], 'limits.questionTimeSeconds'),
    randomQuestionOrder: value['randomQuestionOrder'] === true,
    showCorrectAnswers: value['showCorrectAnswers'] !== false,
  };
}

function optionalPositive(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function strictOptionalPositive(value: unknown, label: string): number | null {
  if (value == null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Pole ${label} musi być dodatnią liczbą całkowitą albo null.`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
