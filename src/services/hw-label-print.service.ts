import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

// @ts-ignore – qz-tray ships no TypeScript declarations
import qz from 'qz-tray';

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
  private qzSecurityReady = false;

  constructor(private http: HttpClient) {}

  async printLabel(assetId: number): Promise<void> {
    if (environment.hwLabelPrintMode === 'server') {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/hw-inventory/${assetId}/print-label`, {})
      );
      return;
    }

    if (environment.hwLabelPrintMode === 'qz-tray') {
      await this.printViaQzTray(assetId);
      return;
    }

    // local-agent mode
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

  private async printViaQzTray(assetId: number): Promise<void> {
    const job = await firstValueFrom(
      this.http.post<LabelPrintJob>(
        `${environment.apiUrl}/hw-inventory/${assetId}/label-print-job`,
        {}
      )
    );

    if (!this.qzSecurityReady) {
      // Unsigned mode – QZ Tray will prompt the user once to allow printing.
      // Replace these with real certificate + signature for silent production use.
      qz.security.setCertificatePromise((resolve: (cert: string) => void) => resolve(''));
      qz.security.setSignaturePromise(
        () => (resolve: (sig: string) => void) => resolve('')
      );
      this.qzSecurityReady = true;
    }

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect().catch(() => {
        throw new Error(
          'QZ Tray is not running on this PC. Install and start QZ Tray, then try again.'
        );
      });
    }

    const printerName = job.printerName || 'TSC TTP-244 Pro';
    const config = qz.configs.create(printerName);
    const data = [{ type: 'raw', format: 'plain', data: job.content }];

    await qz.print(config, data);
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

  async printLabels(assetIds: number[]): Promise<{ successCount: number; failedIds: number[] }> {
    const failedIds: number[] = [];
    let successCount = 0;

    for (const assetId of assetIds) {
      try {
        await this.printLabel(assetId);
        successCount += 1;
      } catch {
        failedIds.push(assetId);
      }
    }

    return { successCount, failedIds };
  }
}
