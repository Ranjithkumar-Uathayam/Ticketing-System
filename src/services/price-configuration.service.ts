import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import {
  ItemMasterItem,
  ItemMasterPage,
  PriceConfigPreview,
  PriceConfigRecord,
  PriceConfigRecordSummary,
} from '../price-configuration.models';

const API = `${environment.apiUrl}/price-configurations`;

@Injectable({ providedIn: 'root' })
export class PriceConfigurationService {
  readonly records = signal<PriceConfigRecordSummary[]>([]);
  readonly loading = signal(false);

  constructor(private http: HttpClient) {}

  async getAll(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<PriceConfigRecordSummary[]>(API));
      this.records.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  async getById(id: number): Promise<PriceConfigRecord> {
    return await firstValueFrom(this.http.get<PriceConfigRecord>(`${API}/${id}`));
  }

  async getItemMaster(search = '', page = 1, limit = 15): Promise<ItemMasterPage> {
    let params = new HttpParams()
      .set('search', search)
      .set('page', String(page))
      .set('limit', String(limit));

    return await firstValueFrom(this.http.get<ItemMasterPage>(`${API}/item-master`, { params }));
  }

  async importItemMaster(file: File): Promise<ItemMasterPage> {
    const itemMasterBase64 = await this.fileToBase64(file);
    return await firstValueFrom(
      this.http.post<ItemMasterPage>(`${API}/item-master/import`, {
        itemMasterFileName: file.name,
        itemMasterBase64,
      })
    );
  }

  async updateItemMasterItem(item: ItemMasterItem): Promise<ItemMasterItem> {
    return await firstValueFrom(
      this.http.put<ItemMasterItem>(`${API}/item-master/${item.id}`, item)
    );
  }

  async generatePreview(pickListFile: File): Promise<PriceConfigPreview> {
    const pickListBase64 = await this.fileToBase64(pickListFile);
   
    return await firstValueFrom(
      this.http.post<PriceConfigPreview>(`${API}/preview`, {
        pickListFileName: pickListFile.name,
        pickListBase64,
      })
    );
  }

  async save(record: Partial<PriceConfigRecord> & Pick<PriceConfigPreview, 'pickListNo' | 'items' | 'labelTemplate'>): Promise<PriceConfigRecord> {
    const payload = {
      pickListNo: record.pickListNo,
      pickListCreatedAt: record.pickListCreatedAt ?? null,
      itemMasterFileName: record.itemMasterFileName ?? null,
      itemMasterUploadedAt: record.itemMasterUploadedAt ?? null,
      pickListFileName: record.pickListFileName ?? null,
      labelTemplate: record.labelTemplate,
      items: record.items,
    };

    if (record.id) {
      return await firstValueFrom(this.http.put<PriceConfigRecord>(`${API}/${record.id}`, payload));
    }

    return await firstValueFrom(this.http.post<PriceConfigRecord>(API, payload));
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => {
        const domMsg = reader.error?.message || '';
        const isLocked = /permission|could not be read/i.test(domMsg);
        reject(new Error(
          isLocked
            ? `Cannot read "${file.name}" — the file may be open in another application (e.g. Excel). Close it and try again.`
            : `Unable to read "${file.name}"${domMsg ? ': ' + domMsg : '.'}`
        ));
      };
      reader.readAsDataURL(file);
    });
  }
}
