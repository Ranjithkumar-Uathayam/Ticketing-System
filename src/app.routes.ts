// src/app.routes.ts  (UPDATED - dispatch routes added)
import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(c => c.LoginComponent)
  },
  {
    path: '',
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    loadComponent: () => import('./components/layout/layout.component').then(c => c.LayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./components/dashboard/dashboard.component').then(c => c.DashboardComponent)
      },
      {
        path: 'tickets',
        loadComponent: () => import('./components/ticket-list/ticket-list.component').then(c => c.TicketListComponent)
      },
      {
        path: 'tickets/:id',
        loadComponent: () => import('./components/ticket-detail/ticket-detail.component').then(c => c.TicketDetailComponent)
      },
      {
        path: 'user-management',
        loadComponent: () => import('./components/user-management/user-management.component').then(c => c.UserManagementComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./components/reports/reports.component').then(c => c.ReportsComponent)
      },
      // ── NEW: Online Dispatch ──────────────────────────────────────────────
      {
        path: 'dispatch',
        loadComponent: () => import('./components/dispatch-list/dispatch-list.component').then(c => c.DispatchListComponent)
      },
      {
        path: 'dispatch/:id',
        loadComponent: () => import('./components/dispatch-form/dispatch-form.component').then(c => c.DispatchFormComponent)
      },
    ]
  },
  { path: '**', redirectTo: '/login' }
];