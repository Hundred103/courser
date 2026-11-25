export interface QuizLimits {
  randomQuestionOrder: boolean;
  showCorrectAnswers: boolean;
}

export const DEFAULT_QUIZ_LIMITS: QuizLimits = {
  randomQuestionOrder: false,
  showCorrectAnswers: true,
};

export function normalizeQuizLimits(value: unknown): QuizLimits {
  if (!isRecord(value)) {
    return { ...DEFAULT_QUIZ_LIMITS };
  }

  return {
    randomQuestionOrder: value['randomQuestionOrder'] === true,
    showCorrectAnswers: value['showCorrectAnswers'] !== false,
  };
}

export function parseQuizLimits(value: unknown): QuizLimits {
  if (value == null) {
    return { ...DEFAULT_QUIZ_LIMITS };
  }

  if (!isRecord(value)) {
    throw new Error('Pole limits musi być obiektem.');
  }

  return {
    randomQuestionOrder: value['randomQuestionOrder'] === true,
    showCorrectAnswers: value['showCorrectAnswers'] !== false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
