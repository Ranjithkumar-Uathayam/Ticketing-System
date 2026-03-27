// src/services/customer-entry.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CustomerEntry } from '../customer-entry.models';
import { environment } from '../environments/environment';

const API_URL = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CustomerEntryService {
  readonly records = signal<CustomerEntry[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async getAll(): Promise<CustomerEntry[]> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<CustomerEntry[]>(`${API_URL}/customer-entries`)
      );
      this.records.set(data);
      return data;
    } finally {
      this.loading.set(false);
    }
  }

  async getById(id: number): Promise<CustomerEntry> {
    return firstValueFrom(
      this.http.get<CustomerEntry>(`${API_URL}/customer-entries/${id}`)
    );
  }

  async create(entry: Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomerEntry> {
    this.loading.set(true);
    try {
      const created = await firstValueFrom(
        this.http.post<CustomerEntry>(`${API_URL}/customer-entries`, entry)
      );
      this.records.update(list => [created, ...list]);
      return created;
    } finally {
      this.loading.set(false);
    }
  }

  async update(id: number, entry: CustomerEntry): Promise<CustomerEntry> {
    this.loading.set(true);
    try {
      const updated = await firstValueFrom(
        this.http.put<CustomerEntry>(`${API_URL}/customer-entries/${id}`, entry)
      );
      this.records.update(list => list.map(r => r.id === id ? updated : r));
      return updated;
    } finally {
      this.loading.set(false);
    }
  }

  async remove(id: number): Promise<void> {
    this.loading.set(true);
    try {
      await firstValueFrom(this.http.delete(`${API_URL}/customer-entries/${id}`));
      this.records.update(list => list.filter(r => r.id !== id));
    } finally {
      this.loading.set(false);
    }
  }
}