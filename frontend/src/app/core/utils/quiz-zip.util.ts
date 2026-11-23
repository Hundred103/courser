import JSZip from 'jszip';
import { QuizCreateDTO } from '../models/quiz.model';
import { DEFAULT_QUIZ_LIMITS, parseQuizLimits } from '../models/quiz-limits.model';
import { DEFAULT_QUIZ_SCORING, parseAnswerPoints, parseQuizScoring } from './quiz-scoring.util';
import { base64ToUint8Array, extensionFromImageReference, imageBytesToDataUrl } from './image.util';
import { MAX_QUIZ_TITLE_LENGTH } from './quiz-request.util';

const QUIZ_JSON = 'quiz.json';

export interface ParsedQuizZip { quiz: QuizCreateDTO; rankingVersionId: string | null; }
export async function parseQuizZip(file: ArrayBuffer): Promise<ParsedQuizZip> {
  const zip = await JSZip.loadAsync(file);
  const jsonEntry = zip.file(QUIZ_JSON) ?? zip.file('quiz-template.json');

  if (!jsonEntry) {
    throw new Error('Archiwum ZIP musi zawierać plik quiz.json w katalogu głównym.');
  }

  const rawJson = await jsonEntry.async('string');
  const parsed = JSON.parse(rawJson) as unknown;
  const quiz = normalizeQuiz(parsed);
  const rankingVersionId = isRecord(parsed) && isRecord(parsed['_ranking']) && typeof parsed['_ranking']['versionId'] === 'string' ? parsed['_ranking']['versionId'] : null;
  const imageFiles = zip.folder('images');

  if (!imageFiles) {
    return { quiz, rankingVersionId };
  }

  return { quiz: {
    ...quiz,
    questions: await Promise.all(
      quiz.questions.map(async (question, index) => {
        if (!question.image) {
          return question;
        }

        const imagePath = question.image.replace(/^images\//, '');
        const imageEntry = imageFiles.file(imagePath) ?? imageFiles.file(question.image);

        if (!imageEntry) {
          throw new Error(`Nie znaleziono obrazu ${question.image} dla pytania ${index + 1}.`);
        }

        try {
          return { ...question, image: imageBytesToDataUrl(await imageEntry.async('uint8array')) };
        } catch (error) {
          throw new Error(`Obraz ${question.image} dla pytania ${index + 1}: ${(error as Error).message}`);
        }
      }),
    ),
  }, rankingVersionId };
}

export interface QuizZipOptions {
  instructions?: readonly string[];
  rankingVersionId?: string | null;
}

export async function buildQuizZip(quiz: QuizCreateDTO, options: QuizZipOptions = {}): Promise<Blob> {
  const { instructions, rankingVersionId } = options;
  const zip = new JSZip();
  const resolvedImages = await Promise.all(
    quiz.questions.map(async (question, index) => {
      if (!question.image) {
        return null;
      }

      return resolveImageForZip(question.image, index);
    }),
  );

  const exportQuiz = {
    ...(instructions?.length ? { _instrukcja: instructions } : {}),
    title: quiz.title,
    scoring: quiz.scoring ?? { ...DEFAULT_QUIZ_SCORING },
    limits: quiz.limits ?? { ...DEFAULT_QUIZ_LIMITS },
    ...(rankingVersionId ? { _ranking: { versionId: rankingVersionId } } : {}),
    questions: quiz.questions.map((question, index) => ({
      content: question.content,
      answers: question.answers.map((answer) => exportAnswer(answer)),
      image: resolvedImages[index]?.filename ?? null,
    })),
  };

  zip.file(QUIZ_JSON, JSON.stringify(exportQuiz, null, 2));

  resolvedImages.forEach((entry) => {
    if (!entry) {
      return;
    }
    zip.file(`images/${entry.filename}`, entry.bytes);
  });

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

export function normalizeQuiz(value: unknown): QuizCreateDTO {
  if (!isRecord(value)) {
    throw new Error('Główny obiekt musi zawierać pola title oraz questions.');
  }

  if (typeof value['title'] !== 'string' || value['title'].trim().length === 0) {
    throw new Error('Pole title musi być niepustym tekstem.');
  }

  if (value['title'].trim().length > MAX_QUIZ_TITLE_LENGTH) {
    throw new Error(`Pole title może mieć najwyżej ${MAX_QUIZ_TITLE_LENGTH} znaków.`);
  }

  if (!Array.isArray(value['questions']) || value['questions'].length === 0) {
    throw new Error('Pole questions musi być niepustą tablicą.');
  }

  const questions = value['questions'].map((question, questionIndex) => normalizeQuestion(question, questionIndex));
  const limits = parseQuizLimits(value['limits']);

  return {
    title: value['title'].trim(),
    scoring: parseQuizScoring(value['scoring']),
    limits,
    questions,
  };
}

function normalizeQuestion(value: unknown, questionIndex: number): QuizCreateDTO['questions'][number] {
  if (!isRecord(value)) {
    throw new Error(`Pytanie ${questionIndex + 1} musi być obiektem.`);
  }

  if (typeof value['content'] !== 'string' || value['content'].trim().length === 0) {
    throw new Error(`Pytanie ${questionIndex + 1} musi mieć niepuste pole content.`);
  }

  if (!Array.isArray(value['answers']) || value['answers'].length === 0) {
    throw new Error(`Pytanie ${questionIndex + 1} musi mieć co najmniej jedną odpowiedź.`);
  }

  const imageValue = value['image'];
  let image: string | null = null;

  if (imageValue !== null && imageValue !== undefined && imageValue !== '') {
    if (typeof imageValue !== 'string' || imageValue.trim().length === 0) {
      throw new Error(`Pole image w pytaniu ${questionIndex + 1} musi być null albo nazwą pliku.`);
    }

    image = imageValue.trim();
  }

  return {
    content: value['content'].trim(),
    image,
    answers: value['answers'].map((answer, answerIndex) => normalizeAnswer(answer, questionIndex, answerIndex)),
  };
}

function normalizeAnswer(
  value: unknown,
  questionIndex: number,
  answerIndex: number,
): QuizCreateDTO['questions'][number]['answers'][number] {
  if (!isRecord(value)) {
    throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi być obiektem.`);
  }

  if (typeof value['content'] !== 'string' || value['content'].trim().length === 0) {
    throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi mieć niepuste pole content.`);
  }

  if (typeof value['correct'] !== 'boolean') {
    throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi mieć pole correct typu boolean.`);
  }

  return {
    content: value['content'].trim(),
    correct: value['correct'],
    points: parseAnswerPoints(
      value['points'],
      `Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1}: pole points`,
      value['correct'],
    ),
  };
}

function exportAnswer(answer: QuizCreateDTO['questions'][number]['answers'][number]): {
  content: string;
  correct: boolean;
  points: number | null;
} {
  return {
    content: answer.content,
    correct: answer.correct,
    points: typeof answer.points === 'number' && Number.isFinite(answer.points) ? answer.points : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function resolveImageForZip(
  image: string,
  index: number,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const extension = extensionFromImageReference(image);
  const filename = `image${index + 1}.${extension}`;

  if (image.startsWith('/media/') || image.startsWith('http://') || image.startsWith('https://')) {
    const response = await fetch(image);
    if (!response.ok) {
      throw new Error(`Nie udało się pobrać obrazu pytania ${index + 1}.`);
    }
    return { filename, bytes: new Uint8Array(await response.arrayBuffer()) };
  }

  return { filename, bytes: base64ToUint8Array(image) };
}
