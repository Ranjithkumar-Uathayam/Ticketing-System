import { Injectable, Injector } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  RouterStateSnapshot,
  Router,
  UrlTree
} from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild {

  constructor(
    private authService: AuthService,
    private injector: Injector
  ) {}

  private getRouter(): Router {
    // Lazily inject the Router service to prevent initialization circular dependency.
    return this.injector.get(Router);
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const router = this.getRouter();
    
    if (this.authService.isLoggedIn()) {
      return true;
    }
    
    // If not logged in, redirect to login page.
    return router.parseUrl('/login');
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const router = this.getRouter();
    const path = childRoute.routeConfig?.path;

    if (path === 'user-management' || path === 'reports') {
      const requiredPermission = path === 'user-management' ? 'User Management' : 'Reports';
      if (this.authService.hasPermission(requiredPermission)) {
        return true;
      }
      // No permission, redirect to dashboard
      return router.parseUrl('/dashboard');
    }

    // For other child routes (dashboard, tickets), allow access.
    return true;
  }
}
