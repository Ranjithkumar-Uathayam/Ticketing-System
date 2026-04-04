// src/services/auth.service.ts  (UPDATED — lockedCategory from user.category field)
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { User, AppScreen, Role, UserRole, USER_ROLES, TicketCategory } from '../models';
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
  readonly isFullAdmin      = computed(() => this.currentUserRole()?.name === USER_ROLES.Admin);

  /**
   * The category this user is LOCKED to — null means they can see all.
   *
   * Priority order:
   *  1. user.category field (set in User Management)
   *  2. Legacy role-name fallback for HardwareAdmin / SoftwareAdmin
   *
   * Full Admin and Manager are never locked (returns null).
   * Support Agents are locked to their assigned category.
   */
  readonly lockedCategory = computed<TicketCategory | null>(() => {
    const user     = this.currentUser();
    const roleName = this.currentUserRole()?.name ?? '';

    // Full Admin and Manager are NEVER locked — they see all
    if (roleName === USER_ROLES.Admin || roleName === USER_ROLES.Manager) return null;

    // If the user has an explicit category assigned, honour it
    if (user?.category) return user.category as TicketCategory;

    // Legacy fallback: HardwareAdmin / SoftwareAdmin before category field existed
    if (roleName === USER_ROLES.HardwareAdmin) return 'Hardware';
    if (roleName === USER_ROLES.SoftwareAdmin) return 'Software';

    return null;
  });

  /** @deprecated use lockedCategory — kept for backward compat with existing templates */
  readonly adminCategory = this.lockedCategory;

  readonly adminCategory2 = computed<'Hardware' | 'Software' | null>(() => {
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

  async restoreSession(): Promise<void> {
    if (this.isLoggedIn()) {
      try {
        await this.apiService.initialLoad();
        await this.notificationService.fetchNotifications(this.currentUser()!.id);
      } catch {
        this.logout();
      }
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.currentUser.set(null);
    this.apiService.clearAll();
    this.notificationService.clearNotifications();
  }

  private loadStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}