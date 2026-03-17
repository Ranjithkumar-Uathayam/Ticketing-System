import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { User, AppScreen, Role, UserRole, USER_ROLES } from '../models';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { environment } from '../environments/environment';

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

interface LoginResponse {
  token: string;
  user:  User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser  = signal<User | null>(this.loadStoredUser());
  readonly token        = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly isLoggedIn   = computed(() => this.currentUser() !== null && this.token() !== null);

  readonly currentUserRole = computed<Role | null>(() => {
    const user = this.currentUser();
    if (!user) return null;
    return this.apiService.getRoleById(user.roleId) ?? null;
  });

  readonly isAdmin = computed(() => {
    const name = this.currentUserRole()?.name ?? '';
    return name === USER_ROLES.Admin
        || name === USER_ROLES.HardwareAdmin
        || name === USER_ROLES.SoftwareAdmin;
  });
  readonly isManager        = computed(() => this.currentUserRole()?.name === USER_ROLES.Manager);
  readonly isEmployee       = computed(() => this.currentUserRole()?.name === USER_ROLES.Employee);
  readonly isSupport        = computed(() => this.currentUserRole()?.name === USER_ROLES.SupportAgent);
  readonly isHardwareAdmin  = computed(() => this.currentUserRole()?.name === USER_ROLES.HardwareAdmin);
  readonly isSoftwareAdmin  = computed(() => this.currentUserRole()?.name === USER_ROLES.SoftwareAdmin);

  readonly adminCategory = computed<'Hardware' | 'Software' | null>(() => {
    if (this.isHardwareAdmin()) return 'Hardware';
    if (this.isSoftwareAdmin()) return 'Software';
    return null;
  });

  constructor(
    private apiService:          ApiService,
    private notificationService: NotificationService,
    private http:                HttpClient,
  ) {}

  hasPermission(screen: AppScreen): boolean {
    return this.currentUserRole()?.permissions.includes(screen) ?? false;
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      );

      if (response?.token && response?.user) {
        // Persist token and user so a page refresh does not log the user out
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));

        this.token.set(response.token);
        this.currentUser.set(response.user);

        await this.apiService.initialLoad();
        await this.notificationService.fetchNotifications(response.user.id);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AuthService.login]', error);
      return false;
    }
  }

  /**
   * Called on app startup to restore session from localStorage.
   * If a stored token/user exists, reload app data without a full login.
   */
  async restoreSession(): Promise<void> {
    if (this.isLoggedIn()) {
      try {
        await this.apiService.initialLoad();
        await this.notificationService.fetchNotifications(this.currentUser()!.id);
      } catch {
        // Token may have expired server-side — clear and let the guard redirect
        this.logout();
      }
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    this.token.set(null);
    this.currentUser.set(null);

    // Delegate data clearing to the service that owns it
    this.apiService.clearAll();
    this.notificationService.clearNotifications();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private loadStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}