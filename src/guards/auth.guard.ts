// src/guards/auth.guard.ts  (UPDATED — customer-entry added)
import { Injectable, Injector } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AppScreen } from '../models';

/** Map of route paths → required permission */
const ROUTE_PERMISSIONS: Record<string, AppScreen> = {
  'user-management': 'User Management',
  'reports':         'Reports',
  'dispatch':        'Dispatch',
  'customer-entry':  'Customer Entry',
};

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(
    private authService: AuthService,
    private injector:    Injector,
  ) {}

  private get router(): Router {
    return this.injector.get(Router);
  }

  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    return this.authService.isLoggedIn() ? true : this.router.parseUrl('/login');
  }

  canActivateChild(childRoute: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    const path = childRoute.routeConfig?.path ?? '';
    const requiredPermission = ROUTE_PERMISSIONS[path];

    if (requiredPermission) {
      // Admins and Managers bypass the permission table for Dispatch & Customer Entry
      if (
        (path === 'dispatch' || path === 'customer-entry') &&
        (this.authService.isAdmin() || this.authService.isManager())
      ) {
        return true;
      }
      return this.authService.hasPermission(requiredPermission)
        ? true
        : this.router.parseUrl('/dashboard');
    }

    return true;
  }
}