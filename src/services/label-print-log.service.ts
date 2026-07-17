import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { PrintLogEntry } from '../label-print.models';

const API = `${environment.apiUrl}/label-print-log`;

@Injectable({ providedIn: 'root' })
export class LabelPrintLogService {

  constructor(private http: HttpClient) {}

  /** Fire-and-forget: logging must never block or fail the print loop. */
  logPrint(entry: PrintLogEntry): void {
    firstValueFrom(this.http.post(API, entry)).catch(err =>
      console.error('[label-print-log] Failed to persist print log entry', err)
    );
  }

  async getRecent(fileName = '', limit = 50): Promise<PrintLogEntry[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (fileName) params = params.set('fileName', fileName);
    return await firstValueFrom(this.http.get<PrintLogEntry[]>(API, { params }));
  }
}
