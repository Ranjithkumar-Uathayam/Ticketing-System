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

  constructor(private http: HttpClient) {}

  async printLabel(assetId: number): Promise<void> {
    console.log("environment.hwLabelPrintMode",environment.hwLabelPrintMode)
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

    console.log('[QZ] Job received from server:', JSON.stringify(job, null, 2));

    // Always re-register security callbacks so a fresh connection always has valid certs.
    qz.security.setCertificatePromise((resolve: (cert: string) => void) => resolve(''));
    qz.security.setSignaturePromise(
      () => (resolve: (sig: string) => void) => resolve('')
    );

    // Register async error callback so QZ Tray errors that happen after qz.print()
    // resolves (e.g. spooler rejection) are at least visible in the console.
    qz.websocket.setErrorCallbacks((err: any) => {
      console.error('[QZ] WebSocket async error:', err);
    });

    // Always force a fresh connection — this guarantees trust is re-evaluated and
    // eliminates stale WebSocket state that can cause silent job drops.
    if (qz.websocket.isActive()) {
      console.log('[QZ] Disconnecting existing connection…');
      try {
        await qz.websocket.disconnect();
        console.log('[QZ] Disconnected.');
      } catch (e) {
        console.warn('[QZ] disconnect() threw (ignored):', e);
      }
    }

    console.log('[QZ] Connecting…');
    try {
      await qz.websocket.connect();
      console.log('[QZ] Connected.');
    } catch {
      throw new Error(
        'QZ Tray is not running on this PC. Install and start QZ Tray, then try again.'
      );
    }

    // List ALL installed printers — no query arg — then do smart name matching.
    let allPrinters: string[];
    try {
      const found = await qz.printers.find();
      allPrinters = Array.isArray(found) ? found : [found];
      console.log('[QZ] All printers:', allPrinters);
    } catch (e) {
      console.error('[QZ] printers.find() failed:', e);
      throw new Error('QZ Tray could not list printers on this PC.');
    }

    const target = (job.printerName || 'TSC TTP-244 Pro').trim();
    console.log('[QZ] Looking for printer:', target);

    // 1. Exact match  2. Case-insensitive match  3. Substring match
    const exactMatch      = allPrinters.find(p => p === target);
    const caseMatch       = allPrinters.find(p => p.toLowerCase() === target.toLowerCase());
    const substringMatch  = allPrinters.find(p =>
      p.toLowerCase().includes(target.toLowerCase()) ||
      target.toLowerCase().includes(p.toLowerCase())
    );

    const resolvedPrinterName = exactMatch ?? caseMatch ?? substringMatch;

    if (!resolvedPrinterName) {
      throw new Error(
        `Printer "${target}" was not found on this PC. ` +
        `Installed printers: ${allPrinters.join(', ') || '(none)'}`
      );
    }

    console.log('[QZ] Resolved printer name:', resolvedPrinterName);

    const config = qz.configs.create(resolvedPrinterName, {
      jobName: job.jobName || 'HW Label',
    });

    // type:'raw' + format:'plain' passes the TSPL string through to the print
    // driver unmodified. QZ Tray uses Java PrintService with RAW document type
    // for this combination — the correct path for TSPL/ZPL thermal printers.
    const data = [{ type: 'raw', format: 'plain', data: job.content }];

    console.log('[QZ] Sending print job…');
    console.log('[QZ] TSPL content:\n', job.content);

    try {
      await qz.print(config, data);
      console.log('[QZ] qz.print() resolved — job handed to QZ Tray successfully.');
    } catch (err: any) {
      console.error('[QZ] qz.print() rejected:', err);
      throw new Error(err?.message || 'QZ Tray failed to send the job to the printer.');
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
