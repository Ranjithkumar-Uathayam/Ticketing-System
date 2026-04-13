import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class HwLabelPrintService {
  constructor(private http: HttpClient) {}

  async printLabel(assetId: number): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/hw-inventory/${assetId}/print-label`, {})
    );
  }
}
