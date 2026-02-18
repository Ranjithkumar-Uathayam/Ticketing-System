import { Injectable, Injector } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private injector: Injector
  ) {}

  private getRouter(): Router {
    // Lazily inject the Router service
    return this.injector.get(Router);
  }
  
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const router = this.getRouter();
    const url = route.url[0]?.path;
    let requiredPermission: 'User Management' | 'Reports' | null = null;
    
    if (url === 'user-management') {
      requiredPermission = 'User Management';
    } else if (url === 'reports') {
      requiredPermission = 'Reports';
    }

    if (requiredPermission && this.authService.hasPermission(requiredPermission)) {
      return true;
    }

    // If the user does not have permission, redirect them to the dashboard.
    return router.parseUrl('/dashboard');
  }
}
