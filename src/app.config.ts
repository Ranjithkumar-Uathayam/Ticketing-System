// src/app.config.ts  (FIXED — APP_INITIALIZER registered)
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';

import { appRoutes }           from './app.routes';
import { authInterceptor }     from './interceptors/auth.interceptor';
import { provideAppInitializer } from './app.initializer';   // ← ADD THIS IMPORT

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withHashLocation()),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    provideAppInitializer(),   // ← ADD THIS — runs restoreSession() before first render
  ]
};