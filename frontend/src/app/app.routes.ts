import { Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page.component';
import { QuizPageComponent } from './features/quiz/quiz-page.component';

export const APP_ROUTES: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'quiz/:id', component: QuizPageComponent },
  { path: '**', redirectTo: '' },
];
