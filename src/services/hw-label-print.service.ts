import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { HWAsset } from '../hw-inventory.models';
import { QzTrayService } from './qz-tray.service';

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

  constructor(private http: HttpClient, private qzTray: QzTrayService) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  async printLabel(asset: HWAsset, includeUser = true): Promise<void> {
    const assetId = asset.id!;
    console.log(`[HW-LABEL] printLabel — assetId=${assetId}, includeUser=${includeUser}, mode=${environment.hwLabelPrintMode}`);

    if (environment.hwLabelPrintMode === 'server') {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/hw-inventory/${assetId}/print-label`, { includeUser })
      );
      return;
    }

    if (environment.hwLabelPrintMode === 'qz-tray') {
      // TSPL is built locally — includeUser is applied here, no backend involvement.
      await this.printViaQzTray(asset, includeUser);
      return;
    }

    // local-agent mode — backend generates TSPL, pass includeUser flag
    const job = await firstValueFrom(
      this.http.post<LabelPrintJob>(
        `${environment.apiUrl}/hw-inventory/${assetId}/label-print-job`,
        { includeUser }
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

  async printLabels(assets: HWAsset[], includeUser = true): Promise<{ successCount: number; failedIds: number[] }> {
    const failedIds: number[] = [];
    let successCount = 0;
    for (const asset of assets) {
      try {
        await this.printLabel(asset, includeUser);
        successCount += 1;
      } catch {
        failedIds.push(asset.id!);
      }
    }
    return { successCount, failedIds };
  }

  // ── QZ Tray ─────────────────────────────────────────────────────────────────

  private async printViaQzTray(asset: HWAsset, includeUser: boolean): Promise<void> {
    console.log(`[QZ] printViaQzTray — assetId=${asset.id}, includeUser=${includeUser}`);

    // Build TSPL on the frontend — includeUser is honoured directly here.
    const printerName: string = (environment as any).hwLabelPrinterName || 'TSC TTP-244 Pro';
    const content = this.buildLabelTspl(asset, includeUser);

    const job: LabelPrintJob = {
      printerName,
      jobName: `HW Label ${asset.assetId || asset.id || ''}`.trim(),
      encoding: 'ascii',
      content,
    };

    console.log('[QZ] TSPL content:\n', content);

    await this.qzTray.print(
      job.printerName,
      [{ type: 'raw', format: 'plain', data: job.content }],
      { jobName: job.jobName }
    );
  }

  // ── TSPL builder (mirrors backend buildLabelTspl exactly) ───────────────────

  private buildLabelTspl(asset: HWAsset, includeUser: boolean): string {
    const esc = (v = '') =>
      String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const val = (v?: string | null) => esc(v || '-');

    const rows: [string, string][] = [
      ...(includeUser ? [['User', val(asset.assignedTo)] as [string, string]] : []),
      ['System', val(asset.assetId)],
      ['Dept',   val(asset.department)],
      ['Model',  esc(`${asset.manufacturer || ''}/${(asset.model || '').trim()}`.trim() || '-')],
      ['SL No',  val(asset.serialNumber)],
    ];

    const ROW_START_Y = 67;
    const ROW_STEP    = 25;

    const lines = [
      'SIZE 50 mm,38 mm',
      'GAP 3 mm,0 mm',
      'DENSITY 10',
      'SPEED 2',
      'DIRECTION 0',
      'REFERENCE 0,0',
      'CLS',
      'TEXT 20,4,"3",0,1,1," Hardware Asset Details "',
      'TEXT 100,30,"2",0,1,1,"B and B Textiles"',
      'BAR 0,52,400,3',
      'BAR 0,57,400,1',
      `BAR 88,65,1,${rows.length * ROW_STEP}`,
    ];

    rows.forEach(([label, value], i) => {
      const y = ROW_START_Y + i * ROW_STEP;
      lines.push(`TEXT 8,${y},"2",0,1,1,"${label}"`);
      lines.push(`TEXT 94,${y},"3",0,1,1,"${value}"`);
    });

    const ruleY = ROW_START_Y + rows.length * ROW_STEP + 2;
    lines.push(`BAR 0,${ruleY},400,1`);

    const barcodeData = (asset.serialNumber || asset.assetId || 'N/A')
      .replace(/[^A-Za-z0-9\-\.\/\+\s]/g, '');
    lines.push(`BARCODE 30,${ruleY + 4},"128",32,1,0,2,2,"${esc(barcodeData)}"`);
    lines.push('PRINT 1,1');

    return lines.join('\r\n') + '\r\n';
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getAgentErrorMessage(error: any): string {
    const agentMessage = error?.error?.message;
    if (typeof agentMessage === 'string' && agentMessage.trim()) return agentMessage;
    if (error?.status === 0)
      return 'Local print agent is not running on this PC. Start the label print agent on the USB-printer computer and try again.';
    return 'Failed to reach the local print agent.';
  }
}
