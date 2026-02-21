import { Component, ChangeDetectionStrategy, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Ticket, TicketPriority, TicketStatus, TicketCategory, Division, DIVISIONS } from '../../models';

export interface ScreenshotItem {
  url: string;
  fileName: string;
}

@Component({
  selector: 'app-ticket-detail',
  templateUrl: './ticket-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class TicketDetailComponent implements OnInit {
  ticket = signal<Ticket | undefined>(undefined);
  isNew = signal(false);
  loading = signal(false);
  uploadingScreenshot = signal(false);

  // Multiple screenshots stored as array in component state
  screenshots = signal<ScreenshotItem[]>([]);

  users;
  currentUser;

  // Comment added by support role
  supportComment = new FormControl('');

  ticketForm = new FormGroup({
    title: new FormControl('', Validators.required),
    createdBy: new FormControl(''),
    employeeId: new FormControl(''),
    extensionNumber: new FormControl(''),
    description: new FormControl('', Validators.required),
    status: new FormControl<TicketStatus>('Open', Validators.required),
    priority: new FormControl<TicketPriority>('Medium', Validators.required),
    category: new FormControl<TicketCategory | null>(null, Validators.required),
    subCategory: new FormControl<string | null>(null, Validators.required),
    division: new FormControl<Division | null>(null, Validators.required),
    assigneeId: new FormControl<number | null>(null),
    screenshotUrl: new FormControl<string | null>(null),
    screenshotFileName: new FormControl<string | null>(null),
  });

  readonly pageTitle = computed(() => this.isNew() ?
    'Create New Ticket' : `Ticket #${this.ticket()?.id}`);

  priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  divisions: Division[] = DIVISIONS;

  allStatuses: TicketStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];

  availableStatuses;
  canEditAssignee;
  isEmployee;
  isSupportView;
  canCreateTicket;
  apiLoading;

  categories: TicketCategory[] = ['Hardware', 'Software'];
  subCategories: Record<TicketCategory, string[]> = {
    'Hardware': ['Network Issue', 'Application Install', 'System Issue', 'New Mail ID/ System Request', 'Others'],
    'Software': ['SAP Not Working', 'SAP User Creation', 'Other Application Issue']
  };
  availableSubCategories = signal<string[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService
  ) {
    this.users = this.apiService.users;
    this.currentUser = this.authService.currentUser;
    this.apiLoading = this.apiService.loading;

    this.availableStatuses = computed(() => {
      if (this.authService.isEmployee()) {
        return ['Open', 'Reopened'];
      }
      return this.allStatuses;
    });

    this.isEmployee = computed(() => this.authService.isEmployee());

    this.canEditAssignee = computed(() => {
        return this.authService.isAdmin() || 
        this.authService.isManager() || 
        this.authService.isSupport();
    });

    this.isSupportView = computed(() => {
      return this.authService.isSupport() && !this.isNew();
    });

    this.canCreateTicket = computed(() => true);

    this.ticketForm.get('category')?.valueChanges.subscribe(value => {
      this.ticketForm.get('subCategory')?.reset();
      if (value) {
        this.availableSubCategories.set(this.subCategories[value]);
        this.ticketForm.get('subCategory')?.enable();
      } else {
        this.availableSubCategories.set([]);
        this.ticketForm.get('subCategory')?.disable();
      }
    });
  }

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === 'new') {
      this.isNew.set(true);
      this.ticketForm.controls.createdBy.setValue(this.currentUser()?.name || '');
      if (!this.authService.isEmployee()) {
        this.ticketForm.controls.createdBy.disable();
      }
      if (!this.canEditAssignee()) {
        this.ticketForm.controls.assigneeId.disable();
      }
      this.ticketForm.get('subCategory')?.disable();
    } else if (idParam) {
      const ticketId = +idParam;
      const foundTicket = this.apiService.getTicketById(ticketId);
      if (foundTicket) {
        this.ticket.set(foundTicket);
        this.ticketForm.patchValue(foundTicket as any);

        // Restore multiple screenshots from stored JSON
        if (foundTicket.screenshotUrl) {
          try {
            const parsed = JSON.parse(foundTicket.screenshotUrl);
            if (Array.isArray(parsed)) {
              this.screenshots.set(parsed);
            } else {
              this.screenshots.set([{ url: foundTicket.screenshotUrl, fileName: foundTicket.screenshotFileName || 'screenshot' }]);
            }
          } catch {
            this.screenshots.set([{ url: foundTicket.screenshotUrl, fileName: foundTicket.screenshotFileName || 'screenshot' }]);
          }
        }

        if (foundTicket.category) {
          this.availableSubCategories.set(this.subCategories[foundTicket.category]);
        } else {
          this.ticketForm.get('subCategory')?.disable();
        }
        if (!this.canEditAssignee()) {
          this.ticketForm.controls.assigneeId.disable();
        }

        if (this.authService.isSupport()) {
          this.ticketForm.controls.title.disable();
          this.ticketForm.controls.description.disable();
          this.ticketForm.controls.priority.disable();
          this.ticketForm.controls.category.disable();
          this.ticketForm.controls.subCategory.disable();
          this.ticketForm.controls.division.disable();
          this.ticketForm.controls.assigneeId.disable();
          this.ticketForm.controls.screenshotUrl.disable();
          this.ticketForm.controls.screenshotFileName.disable();
        }
      } else {
        this.router.navigate(['/tickets']);
      }
    }
  }

  onFilesSelected(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    if (!files.length) return;

    this.uploadingScreenshot.set(true);

    const readers = files.map(file => new Promise<ScreenshotItem>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({
        url: e.target?.result as string,
        fileName: file.name
      });
      reader.readAsDataURL(file);
    }));

    Promise.all(readers).then(newItems => {
      this.screenshots.update(existing => [...existing, ...newItems]);
      this.uploadingScreenshot.set(false);
      (event.target as HTMLInputElement).value = '';
    });
  }

  removeScreenshot(index: number) {
    this.screenshots.update(items => items.filter((_, i) => i !== index));
  }

  openScreenshot(url: string) {
    window.open(url, '_blank');
  }

  downloadScreenshot(url: string, fileName: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }

  async saveTicket() {
    if (this.ticketForm.invalid) return;

    this.loading.set(true);
    const formValue = this.ticketForm.getRawValue();
    const screenshotList = this.screenshots();

    const screenshotUrl = screenshotList.length > 0 ? JSON.stringify(screenshotList) : null;
    const screenshotFileName = screenshotList.length > 0 ? screenshotList.map(s => s.fileName).join(', ') : null;

    try {
      if (this.isNew()) {
        const newTicketData = {
          ...formValue,
          reporterId: this.currentUser()!.id,
          screenshotUrl,
          screenshotFileName,
        } as Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>;
        await this.apiService.createTicket(newTicketData);
      } else {
        const currentTicket = this.ticket();
        if (currentTicket) {
          const updatedTicket: Ticket = {
            ...currentTicket,
            ...formValue,
            screenshotUrl: screenshotUrl ?? undefined,
            screenshotFileName: screenshotFileName ?? undefined,
            description: this.authService.isSupport() && this.supportComment.value
              ? `${currentTicket.description}\n\n[Support Comment - ${new Date().toLocaleString()}]: ${this.supportComment.value}`
              : (formValue.description ?? currentTicket.description),
          };
          await this.apiService.updateTicket(updatedTicket);
        }
      }
      this.router.navigate(['/tickets']);
    } catch (error) {
      console.log('Failed to save ticket', error);
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/tickets']);
  }
}