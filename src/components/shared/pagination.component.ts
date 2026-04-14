// src/components/shared/pagination.component.ts
import {
  Component, ChangeDetectionStrategy,
  input, output, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (totalPages() > 1) {
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 mt-1 rounded-xl"
           style="border-top: 1.5px solid #E8EDF8; background: #F8F9FC;">

        <!-- Left: count label -->
        <p class="text-xs font-medium" style="color: rgba(27,47,110,0.5);">
          Showing
          <span class="font-bold" style="color:#1B2F6E;">{{ rangeStart() }}–{{ rangeEnd() }}</span>
          of
          <span class="font-bold" style="color:#1B2F6E;">{{ totalItems() }}</span>
          {{ itemLabel() }}
        </p>

        <!-- Right: page controls -->
        <div class="flex items-center gap-1.5">

          <!-- First -->
          <button (click)="go(1)" [disabled]="currentPage() === 1"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style="border: 1.5px solid #E8EDF8; background: white; color: #1B2F6E;"
            title="First page">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
            </svg>
          </button>

          <!-- Prev -->
          <button (click)="go(currentPage() - 1)" [disabled]="currentPage() === 1"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style="border: 1.5px solid #E8EDF8; background: white; color: #1B2F6E;"
            title="Previous page">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <!-- Page numbers -->
          @for (p of visiblePages(); track p) {
            @if (p === -1) {
              <span class="w-8 h-8 flex items-center justify-center text-xs font-bold"
                    style="color: rgba(27,47,110,0.3);">…</span>
            } @else {
              <button (click)="go(p)"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all"
                [style.background]="p === currentPage() ? '#1B2F6E' : 'white'"
                [style.color]="p === currentPage() ? '#FDB515' : '#1B2F6E'"
                [style.border]="'1.5px solid ' + (p === currentPage() ? '#1B2F6E' : '#E8EDF8')">
                {{ p }}
              </button>
            }
          }

          <!-- Next -->
          <button (click)="go(currentPage() + 1)" [disabled]="currentPage() === totalPages()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style="border: 1.5px solid #E8EDF8; background: white; color: #1B2F6E;"
            title="Next page">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
            </svg>
          </button>

          <!-- Last -->
          <button (click)="go(totalPages())" [disabled]="currentPage() === totalPages()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style="border: 1.5px solid #E8EDF8; background: white; color: #1B2F6E;"
            title="Last page">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    }
  `,
})
export class PaginationComponent {
  currentPage = input.required<number>();
  totalItems  = input.required<number>();
  pageSize    = input<number>(15);
  itemLabel   = input<string>('items');

  pageChange = output<number>();

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );

  rangeStart = computed(() =>
    this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1
  );

  rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.totalItems())
  );

  /** Produces a page-number array with -1 as ellipsis sentinel */
  visiblePages = computed(() => {
    const total   = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages: number[] = [];
    pages.push(1);
    if (current > 3) pages.push(-1);
    const start = Math.max(2, current - 1);
    const end   = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  });

  go(page: number) {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    if (clamped !== this.currentPage()) this.pageChange.emit(clamped);
  }
}