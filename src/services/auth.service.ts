import { Injectable, signal, computed } from '@angular/core';
import { User, AppScreen, Role } from '../models';
import { ApiService } from './api.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from './notification.service';

const API_URL = 'http://localhost:3001/api';
// const API_URL = "https://vms.uathayam.in:4300/TICKETING-API/api"

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  readonly currentUserRole = computed<Role | null>(() => {
    const user = this.currentUser();
    if (!user) return null;
    return this.apiService.getRoleById(user.roleId) ?? null;
  });

  readonly isAdmin = computed(() => this.currentUserRole()?.name === 'Admin');
  readonly isManager = computed(() => this.currentUserRole()?.name === 'Manager');
  readonly isEmployee = computed(() => this.currentUserRole()?.name === 'Employee');
  readonly isSupport = computed(() => this.currentUserRole()?.name === 'Support Agent');

  constructor(
    private apiService: ApiService,
    private notificationService: NotificationService,
    private http: HttpClient
  ) {}

  hasPermission(screen: AppScreen): boolean {
    return this.currentUserRole()?.permissions.includes(screen) ?? false;
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const user = await firstValueFrom(this.http.post<User>(`${API_URL}/auth/login`, { username, password }));
      if (user) {
        this.currentUser.set(user);
        // After successful login, load all necessary app data
        await this.apiService.initialLoad();
        // and fetch notifications
        await this.notificationService.fetchNotifications(user.id);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed', error);
      return false;
    }
  }

  logout() {
    this.currentUser.set(null);
    // Clear data on logout
    this.apiService.users.set([]);
    this.apiService.roles.set([]);
    this.apiService.tickets.set([]);
    this.notificationService.clearNotifications();
  }
}