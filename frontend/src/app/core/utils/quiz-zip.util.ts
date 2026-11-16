import JSZip from 'jszip';
import { QuizCreateDTO } from '../models/quiz.model';
import { DEFAULT_QUIZ_LIMITS, parseQuizLimits } from '../models/quiz-limits.model';
import { DEFAULT_QUIZ_SCORING, parseAnswerPoints, parseQuizScoring } from './quiz-scoring.util';
import { base64ToUint8Array, extensionFromImageReference } from './image-compression.util';

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

        const bytes = await imageEntry.async('uint8array');
        const mime = detectMimeType(bytes) ?? mimeFromFilename(question.image) ?? 'application/octet-stream';
        return {
          ...question,
          image: `data:${mime};base64,${uint8ToBase64(bytes)}`,
        };
      }),
    ),
  }, rankingVersionId };
}

export async function buildQuizZip(quiz: QuizCreateDTO, instructions?: readonly string[]): Promise<Blob> {
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
    questions: quiz.questions.map((question, index) => ({
      content: question.content,
      image: resolvedImages[index]?.filename ?? null,
      answers: question.answers.map((answer) => exportAnswer(answer)),
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
    ),
  };
}

function exportAnswer(answer: QuizCreateDTO['questions'][number]['answers'][number]): {
  content: string;
  correct: boolean;
  points?: number;
} {
  const exported: { content: string; correct: boolean; points?: number } = {
    content: answer.content,
    correct: answer.correct,
  };

  if (typeof answer.points === 'number' && Number.isFinite(answer.points)) {
    exported.points = answer.points;
  }

  return exported;
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

function mimeFromFilename(filename: string): string | null {
  const extension = filename.includes('.')
    ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase()
    : '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    default:
      return null;
  }
}

function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (
    bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  return null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
