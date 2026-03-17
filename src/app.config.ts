import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter }        from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { appRoutes }            from './app.routes';
import { AuthInterceptor }      from './interceptors/auth.interceptor';
import { provideAppInitializer } from './app.initializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),

    // Register HttpClient with DI-based interceptor support
    provideHttpClient(withInterceptorsFromDi()),

    // JWT interceptor — attaches Bearer token to every API request
    {
      provide:  HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi:    true,
    },

    // Restore session from localStorage before first render
    provideAppInitializer(),
  ],
};