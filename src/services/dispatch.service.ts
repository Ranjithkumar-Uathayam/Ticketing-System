// src/services/dispatch.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DispatchRecord } from '../dispatch.models';

const API_URL = 'http://localhost:3001/api';
// const API_URL = 'https://vms.uathayam.in:4300/TICKETING-API/api';

@Injectable({ providedIn: 'root' })
export class DispatchService {
  readonly records = signal<DispatchRecord[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async getAll(): Promise<DispatchRecord[]> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<DispatchRecord[]>(`${API_URL}/dispatch`)
      );
      this.records.set(data);
      return data;
    } finally {
      this.loading.set(false);
    }
  }

  async getById(id: number): Promise<DispatchRecord> {
    return firstValueFrom(
      this.http.get<DispatchRecord>(`${API_URL}/dispatch/${id}`)
    );
  }

  async create(record: DispatchRecord): Promise<DispatchRecord> {
    this.loading.set(true);
    try {
      const created = await firstValueFrom(
        this.http.post<DispatchRecord>(`${API_URL}/dispatch`, record)
      );
      this.records.update(list => [created, ...list]);
      return created;
    } finally {
      this.loading.set(false);
    }
  }

  async update(id: number, record: DispatchRecord): Promise<DispatchRecord> {
    this.loading.set(true);
    try {
      const updated = await firstValueFrom(
        this.http.put<DispatchRecord>(`${API_URL}/dispatch/${id}`, record)
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
      await firstValueFrom(this.http.delete(`${API_URL}/dispatch/${id}`));
      this.records.update(list => list.filter(r => r.id !== id));
    } finally {
      this.loading.set(false);
    }
  }
}