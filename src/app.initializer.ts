import { APP_INITIALIZER, Provider } from '@angular/core';
import { AuthService } from './services/auth.service';

/**
 * Run AuthService.restoreSession() before the app renders.
 * This reloads app data when a user refreshes the page, so they
 * don't get stuck on a blank state even though their token is still valid.
 */
export function provideAppInitializer(): Provider {
  return {
    provide: APP_INITIALIZER,
    useFactory: (authService: AuthService) => () => authService.restoreSession(),
    deps: [AuthService],
    multi: true,
  };
}