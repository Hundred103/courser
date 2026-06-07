import { CanDeactivateFn, Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page.component';
import { QuizCreatePageComponent } from './features/quiz-create/quiz-create-page.component';
import { QuizImportPageComponent } from './features/quiz-import/quiz-import-page.component';
import { QuizPlayPageComponent } from './features/quiz-play/quiz-play-page.component';

const canDeactivateQuiz: CanDeactivateFn<QuizPlayPageComponent> = (component) => component.canDeactivate();
const canDeactivateQuizCreate: CanDeactivateFn<QuizCreatePageComponent> = (component) => component.canDeactivate();

export const APP_ROUTES: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'quizzes/import', component: QuizImportPageComponent },
  { path: 'quizzes/new', component: QuizCreatePageComponent, canDeactivate: [canDeactivateQuizCreate] },
  { path: 'quizzes/:id/edit', component: QuizCreatePageComponent, canDeactivate: [canDeactivateQuizCreate] },
  { path: 'quizzes/:id/play', component: QuizPlayPageComponent, canDeactivate: [canDeactivateQuiz] },
  { path: '**', redirectTo: '' },
];
