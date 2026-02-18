import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(c => c.LoginComponent)
  },
  {
    path: '',
    canActivate: [AuthGuard], // Protects the main layout
    canActivateChild: [AuthGuard], // Protects children of the layout
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
      }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
