// src/interceptors/auth.interceptor.ts  (UPDATED — 401 session expiry redirect)
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject }                               from '@angular/core';
import { Router }                               from '@angular/router';
import { catchError, throwError }               from 'rxjs';

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token  = localStorage.getItem(TOKEN_KEY);

  // Attach Bearer token to every outgoing request
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // ── Session expired or token invalid ─────────────────────────────────
        // Clear stored credentials so the app boots cleanly on next visit
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);

        // Navigate to login, passing the current URL so we can redirect back
        // after a successful re-login (optional: remove extras if not needed)
        const returnUrl = window.location.hash.replace('#', '') || '/dashboard';
        router.navigate(['/login'], {
          replaceUrl: true,
          state: { sessionExpired: true, returnUrl },
        });
      }
      return throwError(() => err);
    }),
  );
};