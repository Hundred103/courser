import JSZip from 'jszip';
import { QuizCreateDTO } from '../models/quiz.model';

const QUIZ_JSON = 'quiz.json';

export async function parseQuizZip(file: ArrayBuffer): Promise<QuizCreateDTO> {
  const zip = await JSZip.loadAsync(file);
  const jsonEntry = zip.file(QUIZ_JSON) ?? zip.file('quiz-template.json');

  if (!jsonEntry) {
    throw new Error('Archiwum ZIP musi zawierać plik quiz.json w katalogu głównym.');
  }

  const rawJson = await jsonEntry.async('string');
  const parsed = JSON.parse(rawJson) as unknown;
  const quiz = normalizeQuiz(parsed);
  const imageFiles = zip.folder('images');

  if (!imageFiles) {
    return quiz;
  }

  return {
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

        const base64 = await imageEntry.async('base64');
        return {
          ...question,
          image: base64,
        };
      }),
    ),
  };
}

export async function buildQuizZip(quiz: QuizCreateDTO): Promise<Blob> {
  const zip = new JSZip();
  const exportQuiz = {
    title: quiz.title,
    questions: quiz.questions.map((question, index) => ({
      content: question.content,
      image: question.image ? `image${index + 1}.jpg` : null,
      answers: question.answers,
    })),
  };

  zip.file(QUIZ_JSON, JSON.stringify(exportQuiz, null, 2));

  quiz.questions.forEach((question, index) => {
    if (!question.image) {
      return;
    }

    const bytes = base64ToUint8Array(question.image);
    zip.file(`images/image${index + 1}.jpg`, bytes);
  });

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function normalizeQuiz(value: unknown): QuizCreateDTO {
  if (!isRecord(value)) {
    throw new Error('Główny obiekt musi zawierać pola title oraz questions.');
  }

  if (typeof value['title'] !== 'string' || value['title'].trim().length === 0) {
    throw new Error('Pole title musi być niepustym tekstem.');
  }

  if (!Array.isArray(value['questions']) || value['questions'].length === 0) {
    throw new Error('Pole questions musi być niepustą tablicą.');
  }

  return {
    title: value['title'].trim(),
    questions: value['questions'].map((question, questionIndex) => normalizeQuestion(question, questionIndex)),
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

  if (imageValue !== null && imageValue !== undefined) {
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const payload = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
