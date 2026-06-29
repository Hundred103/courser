import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { APP_ROUTES } from './app/app.routes';
import { authInterceptor } from './app/core/services/auth.interceptor';
import { AppComponent } from './app/layout/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([authInterceptor])), provideRouter(APP_ROUTES)],
}).catch((error: unknown) => console.error(error));
