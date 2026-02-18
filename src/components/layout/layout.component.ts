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
  
  userMenuOpen = signal(false);
  notificationPanelOpen = signal(false);
  sidebarOpen = signal(false);
  
  pageTitle = signal('Dashboard');

  canViewDashboard;
  canViewTickets;
  canViewUserManagement;
  canViewReports;

  constructor(
    public authService: AuthService, 
    public notificationService: NotificationService, 
    public router: Router
  ) {
    this.user = this.authService.currentUser;
    this.userRole = this.authService.currentUserRole;
    this.notifications = this.notificationService.notifications;
    this.unreadCount = this.notificationService.unreadCount;

    this.canViewDashboard = computed(() => this.authService.hasPermission('Dashboard'));
    this.canViewTickets = computed(() => this.authService.hasPermission('Tickets'));
    this.canViewUserManagement = computed(() => this.authService.hasPermission('User Management'));
    this.canViewReports = computed(() => this.authService.hasPermission('Reports'));
    
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.pageTitle.set(this.getRouteData(event.urlAfterRedirects));
      this.sidebarOpen.set(false);
    });
  }

  getRouteData(url: string): string {
    if (url.includes('/dashboard')) return 'Dashboard';
    if (url.includes('/tickets/')) return 'Ticket Details';
    if (url.includes('/tickets')) return 'Tickets';
    if (url.includes('/user-management')) return 'User Management';
    if (url.includes('/reports')) return 'Reports';
    return 'Dashboard';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
  
  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  toggleUserMenu() {
    this.userMenuOpen.update(v => !v);
    this.notificationPanelOpen.set(false);
  }

  toggleNotificationPanel() {
    this.notificationPanelOpen.update(v => !v);
    this.userMenuOpen.set(false);
    if (this.notificationPanelOpen() && this.unreadCount() > 0) {
      this.notificationService.markAsRead(this.user()!.id);
    }
  }

  clearAllNotifications() {
    this.notificationService.clearAll(this.user()!.id);
  }

  timeAgo(date: string): string {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "min ago";
    return Math.floor(seconds) + "s ago";
  }

  navigateToTicket(ticketId: number | null) {
    if (ticketId) {
      this.router.navigate(['/tickets', ticketId]);
      this.notificationPanelOpen.set(false);
    }
  }
}
