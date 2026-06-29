import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { APP_ROUTES } from './app/app.routes';
import { AppComponent } from './app/layout/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideRouter(APP_ROUTES)],
}).catch((error: unknown) => console.error(error));
