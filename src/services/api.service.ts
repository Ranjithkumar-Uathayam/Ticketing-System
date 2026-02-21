import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Ticket, User, Role } from '../models';

// In a real app, move this to an environment file
// const API_URL = 'http://localhost:3001/api';
const API_URL = "https://vms.uathayam.in:4300/TICKETING-API/api"

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly tickets = signal<Ticket[]>([]);
  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async initialLoad() {
    this.loading.set(true);
    try {
      await Promise.all([
        this.getTickets(),
        this.getUsers(),
        this.getRoles()
      ]);
    } catch (error) {
      console.log('Failed to load initial data', error);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Tickets ---
  async getTickets() {
    const tickets = await firstValueFrom(this.http.get<Ticket[]>(`${API_URL}/tickets`));
    this.tickets.set(tickets);
  }

  getTicketById(id: number): Ticket | undefined {
    return this.tickets().find(t => t.id === id);
  }

  async createTicket(ticketData: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>) {
    const newTicket = await firstValueFrom(this.http.post<Ticket>(`${API_URL}/tickets`, ticketData));
    this.tickets.update(tickets => [newTicket, ...tickets]);
  }

  async updateTicket(ticketData: Ticket) {
    const updatedTicket = await firstValueFrom(this.http.put<Ticket>(`${API_URL}/tickets/${ticketData.id}`, ticketData));
    this.tickets.update(tickets => 
      tickets.map(t => t.id === updatedTicket.id ? updatedTicket : t)
    );
  }

  // --- Users ---
  async getUsers() {
    const users = await firstValueFrom(this.http.get<User[]>(`${API_URL}/users`));
    this.users.set(users);
  }
  
  getUserById(id: number): User | undefined {
    return this.users().find(u => u.id === id);
  }

  async createUser(userData: Omit<User, 'id'>) {
    const newUser = await firstValueFrom(this.http.post<User>(`${API_URL}/users`, userData));
    this.users.update(users => [...users, newUser]);
  }

  async updateUser(userData: User) {
    const updatedUser = await firstValueFrom(this.http.put<User>(`${API_URL}/users/${userData.id}`, userData));
    this.users.update(users => users.map(u => u.id === updatedUser.id ? updatedUser : u));
  }

  // --- Roles ---
  async getRoles() {
    const roles = await firstValueFrom(this.http.get<Role[]>(`${API_URL}/roles`));
    this.roles.set(roles);
  }
  
  getRoleById(id: number): Role | undefined {
    return this.roles().find(r => r.id === id);
  }

  async createRole(roleData: Omit<Role, 'id'>) {
    const newRole = await firstValueFrom(this.http.post<Role>(`${API_URL}/roles`, roleData));
    this.roles.update(roles => [...roles, newRole]);
  }
  
  async updateRole(roleData: Role) {
    const updatedRole = await firstValueFrom(this.http.put<Role>(`${API_URL}/roles/${roleData.id}`, roleData));
    this.roles.update(roles => roles.map(r => r.id === updatedRole.id ? updatedRole : r));
  }
}
