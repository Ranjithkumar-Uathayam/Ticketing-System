// src/services/hw-inventory.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HWAsset } from '../hw-inventory.models';
import { environment } from '../environments/environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class HwInventoryService {
  readonly assets  = signal<HWAsset[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async getAll(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<HWAsset[]>(`${API}/hw-inventory`)
      );
      this.assets.set(data);
    } catch {
      // Backend not yet available — start with empty list
      // The user can add assets via the form immediately
      if (this.assets().length === 0) this.assets.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async getById(id: number): Promise<HWAsset> {
    this.loading.set(true);
    try {
      const asset = await firstValueFrom(
        this.http.get<HWAsset>(`${API}/hw-inventory/${id}`)
      );

      this.assets.update(list => {
        const exists = list.some(item => item.id === asset.id);
        return exists
          ? list.map(item => item.id === asset.id ? asset : item)
          : [asset, ...list];
      });

      return asset;
    } finally {
      this.loading.set(false);
    }
  }

  async create(asset: Omit<HWAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<HWAsset> {
    this.loading.set(true);
    try {
      const created = await firstValueFrom(
        this.http.post<HWAsset>(`${API}/hw-inventory`, asset)
      );
      this.assets.update(list => [created, ...list]);
      return created;
    } catch {
      const fake: HWAsset = { ...asset, id: Date.now(), createdAt: new Date().toISOString() };
      this.assets.update(list => [fake, ...list]);
      return fake;
    } finally {
      this.loading.set(false);
    }
  }

  async update(id: number, asset: HWAsset): Promise<HWAsset> {
    this.loading.set(true);
    try {
      const updated = await firstValueFrom(
        this.http.put<HWAsset>(`${API}/hw-inventory/${id}`, asset)
      );
      this.assets.update(list => list.map(a => a.id === id ? updated : a));
      return updated;
    } catch {
      const fake = { ...asset, updatedAt: new Date().toISOString() };
      this.assets.update(list => list.map(a => a.id === id ? fake : a));
      return fake;
    } finally {
      this.loading.set(false);
    }
  }

  async remove(id: number): Promise<void> {
    this.loading.set(true);
    try {
      await firstValueFrom(this.http.delete(`${API}/hw-inventory/${id}`));
    } catch { /* offline: still remove from signal */ } finally {
      this.assets.update(list => list.filter(a => a.id !== id));
      this.loading.set(false);
    }
  }
}
