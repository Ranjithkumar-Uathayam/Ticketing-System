import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

interface LabelPrintJob {
  printerName: string;
  jobName: string;
  encoding: 'ascii' | 'utf-8' | string;
  content: string;
}

interface LocalPrintAgentResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class HwLabelPrintService {
  constructor(private http: HttpClient) {}

  async printLabel(assetId: number): Promise<void> {
    if (environment.hwLabelPrintMode === 'server') {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/hw-inventory/${assetId}/print-label`, {})
      );
      return;
    }

    const job = await firstValueFrom(
      this.http.post<LabelPrintJob>(
        `${environment.apiUrl}/hw-inventory/${assetId}/label-print-job`,
        {}
      )
    );

    try {
      await firstValueFrom(
        this.http.post<LocalPrintAgentResponse>(
          `${environment.hwLabelAgentUrl}/api/print-jobs`,
          job
        )
      );
    } catch (error: any) {
      throw new Error(this.getAgentErrorMessage(error));
    }
  }

  private getAgentErrorMessage(error: any): string {
    const agentMessage = error?.error?.message;
    if (typeof agentMessage === 'string' && agentMessage.trim()) {
      return agentMessage;
    }

    if (error?.status === 0) {
      return 'Local print agent is not running on this PC. Start the label print agent on the USB-printer computer and try again.';
    }

    return 'Failed to reach the local print agent.';
  }
}
