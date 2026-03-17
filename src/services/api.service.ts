import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Ticket, User, Role } from '../models';
import { environment } from '../environments/environment';

export interface TicketPage {
  data:  Ticket[];
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export interface TicketFilters {
  page?:       number;
  limit?:      number;
  status?:     string;
  priority?:   string;
  assigneeId?: number;
  reporterId?: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly tickets = signal<Ticket[]>([]);
  readonly users   = signal<User[]>([]);
  readonly roles   = signal<Role[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async initialLoad(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([this.getTickets(), this.getUsers(), this.getRoles()]);
    } catch (error) {
      console.error('[ApiService.initialLoad]', error);
    } finally {
      this.loading.set(false);
    }
  }

  /** Clear all cached data — called on logout */
  clearAll(): void {
    this.tickets.set([]);
    this.users.set([]);
    this.roles.set([]);
  }

  // ─── Tickets ──────────────────────────────────────────────────────────────

  async getTickets(filters: TicketFilters = {}): Promise<void> {
    let params = new HttpParams()
      .set('page',  String(filters.page  ?? 1))
      .set('limit', String(filters.limit ?? 200)); // default: fetch all for client-side state

    if (filters.status)     params = params.set('status',     filters.status);
    if (filters.priority)   params = params.set('priority',   filters.priority);
    if (filters.assigneeId) params = params.set('assigneeId', String(filters.assigneeId));
    if (filters.reporterId) params = params.set('reporterId', String(filters.reporterId));

    const page = await firstValueFrom(
      this.http.get<TicketPage>(`${environment.apiUrl}/tickets`, { params })
    );
    this.tickets.set(page.data);
  }

  getTicketById(id: number): Ticket | undefined {
    return this.tickets().find(t => t.id === id);
  }

  async createTicket(ticketData: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const newTicket = await firstValueFrom(
      this.http.post<Ticket>(`${environment.apiUrl}/tickets`, ticketData)
    );
    this.tickets.update(tickets => [newTicket, ...tickets]);
  }

  async updateTicket(ticketData: Ticket): Promise<void> {
    const updatedTicket = await firstValueFrom(
      this.http.put<Ticket>(`${environment.apiUrl}/tickets/${ticketData.id}`, ticketData)
    );
    this.tickets.update(tickets =>
      tickets.map(t => t.id === updatedTicket.id ? updatedTicket : t)
    );
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async getUsers(): Promise<void> {
    const users = await firstValueFrom(this.http.get<User[]>(`${environment.apiUrl}/users`));
    this.users.set(users);
  }

  getUserById(id: number): User | undefined {
    return this.users().find(u => u.id === id);
  }

  async createUser(userData: Omit<User, 'id'>): Promise<void> {
    const newUser = await firstValueFrom(
      this.http.post<User>(`${environment.apiUrl}/users`, userData)
    );
    this.users.update(users => [...users, newUser]);
  }

  async updateUser(userData: User): Promise<void> {
    const updatedUser = await firstValueFrom(
      this.http.put<User>(`${environment.apiUrl}/users/${userData.id}`, userData)
    );
    this.users.update(users =>
      users.map(u => u.id === updatedUser.id ? updatedUser : u)
    );
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  async getRoles(): Promise<void> {
    const roles = await firstValueFrom(this.http.get<Role[]>(`${environment.apiUrl}/roles`));
    this.roles.set(roles);
  }

  getRoleById(id: number): Role | undefined {
    return this.roles().find(r => r.id === id);
  }

  async createRole(roleData: Omit<Role, 'id'>): Promise<void> {
    const newRole = await firstValueFrom(
      this.http.post<Role>(`${environment.apiUrl}/roles`, roleData)
    );
    this.roles.update(roles => [...roles, newRole]);
  }

  async updateRole(roleData: Role): Promise<void> {
    const updatedRole = await firstValueFrom(
      this.http.put<Role>(`${environment.apiUrl}/roles/${roleData.id}`, roleData)
    );
    this.roles.update(roles =>
      roles.map(r => r.id === updatedRole.id ? updatedRole : r)
    );
  }
}