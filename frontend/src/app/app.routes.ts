import { CanDeactivateFn, Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page.component';
import { QuizPageComponent } from './features/quiz/quiz-page.component';



const canDeactivateQuiz: CanDeactivateFn<QuizPageComponent> = (component) => component.canDeactivate();

export const APP_ROUTES: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'quiz/:id', component: QuizPageComponent, canDeactivate: [canDeactivateQuiz] },
  { path: '**', redirectTo: '' },
];
