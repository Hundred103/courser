import { HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, throwError } from 'rxjs';

/** quizzes.title is VARCHAR(255). */
export const MAX_QUIZ_TITLE_LENGTH = 255;

/** nginx body limit (30 MB). */
export const MAX_QUIZ_REQUEST_BYTES = 30 * 1024 * 1024;

export const QUIZ_TOO_LARGE_MESSAGE =
  'Quiz jest za duży do wysłania naraz (limit 30 MB razem z nowymi obrazami). Zmniejsz albo usuń część obrazów.';

const COPY_SUFFIX = ' (kopia)';

/** Match MapperDTO.copyTitle. */
export function copyTitle(title: string): string {
  return title.substring(0, MAX_QUIZ_TITLE_LENGTH - COPY_SUFFIX.length) + COPY_SUFFIX;
}

export class QuizUserError extends Error {}

/** Reject oversized payload before nginx 413. */
export function sendIfQuizFits<T>(body: unknown, send: () => Observable<T>): Observable<T> {
  return defer(() =>
    new Blob([JSON.stringify(body)]).size > MAX_QUIZ_REQUEST_BYTES
      ? throwError(() => new QuizUserError(QUIZ_TOO_LARGE_MESSAGE))
      : send(),
  );
}

// 400/404/409: body.error is user-facing; other statuses use fallback.
export function serverErrorMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || ![400, 404, 409].includes(error.status)) return null;
  const message = (error.error as { error?: unknown } | null)?.error;
  return typeof message === 'string' && message.trim() ? message : null;
}

export function quizRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof QuizUserError) return error.message;
  if (error instanceof HttpErrorResponse && error.status === 413) return QUIZ_TOO_LARGE_MESSAGE;
  return serverErrorMessage(error) ?? fallback;
}
