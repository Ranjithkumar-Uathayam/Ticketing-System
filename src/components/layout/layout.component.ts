// src/components/layout/layout.component.ts  (UPDATED - dispatch added to nav)
import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
})
export class LayoutComponent {
  user;
  userRole;
  notifications;
  unreadCount;

  userMenuOpen          = signal(false);
  notificationPanelOpen = signal(false);
  sidebarOpen           = signal(false);
  pageTitle             = signal('Dashboard');

  canViewDashboard;
  canViewTickets;
  canViewUserManagement;
  canViewReports;
  canViewDispatch;   // ← NEW

  constructor(
    public authService:        AuthService,
    public notificationService: NotificationService,
    public router:             Router,
  ) {
    this.user          = this.authService.currentUser;
    this.userRole      = this.authService.currentUserRole;
    this.notifications = this.notificationService.notifications;
    this.unreadCount   = this.notificationService.unreadCount;

    this.canViewDashboard      = computed(() => this.authService.hasPermission('Dashboard'));
    this.canViewTickets        = computed(() => this.authService.hasPermission('Tickets'));
    this.canViewUserManagement = computed(() => this.authService.hasPermission('User Management'));
    this.canViewReports        = computed(() => this.authService.hasPermission('Reports'));
    this.canViewDispatch       = computed(() => this.authService.hasPermission('Dispatch') || this.authService.isAdmin() || this.authService.isManager() || this.authService.isSupport());

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((e: NavigationEnd) => {
      this.pageTitle.set(this.getRouteTitle(e.urlAfterRedirects));
      this.sidebarOpen.set(false);
    });
  }

  getRouteTitle(url: string): string {
    if (url.includes('/dashboard'))       return 'Dashboard';
    if (url.includes('/tickets/'))        return 'Ticket Details';
    if (url.includes('/tickets'))         return 'Tickets';
    if (url.includes('/user-management')) return 'User Management';
    if (url.includes('/reports'))         return 'Reports';
    if (url.match(/\/dispatch\/\d+/))     return 'Dispatch Entry';
    if (url.includes('/dispatch/new'))    return 'New Dispatch Entry';
    if (url.includes('/dispatch'))        return 'Online Dispatch Details';
    return 'Dashboard';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  toggleSidebar()           { this.sidebarOpen.update(v => !v); }
  toggleUserMenu()          { this.userMenuOpen.update(v => !v); }
  toggleNotificationPanel() { this.notificationPanelOpen.update(v => !v); }
}