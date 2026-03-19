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

  screenshots = signal<ScreenshotItem[]>([]);

  users;
  currentUser;

  supportComment = new FormControl('');

  ticketForm = new FormGroup({
    title: new FormControl('', Validators.required),
    createdBy: new FormControl(''),
    employeeId: new FormControl(''),
    extensionNumber: new FormControl(''),
    description: new FormControl('', Validators.required),
    status: new FormControl<TicketStatus>('New', Validators.required),
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

  allStatuses: TicketStatus[] = ['New', 'Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];

  availableStatuses;
  canEditAssignee;
  isEmployee;
  isSupportView;
  canCreateTicket;
  apiLoading;

  categories: TicketCategory[] = ['Hardware', 'Software'];
  subCategories: Record<TicketCategory, string[]> = {
    'Hardware': ['Network Issue', 'Application Install', 'System Issue', 'New Mail ID/ System Request', 'Others'],
    'Software': ['SAP Login Issues',
        'SAP Addon Connection Failure',
        'SAP New Requirement / Fine Tune',
        'Crystal Report - Creating new reports and modifying existing Crystal Reports based',
        'New Addon Development / Changes',
        'SAP Data Issue / Transaction Error',
        'API / Integration Issues',
        'User Support and Guidance', 
        'SQL Query Support',
        'SAP Master Data Management (Item Master, BP Master) – DTW Tools',
        'SAP User Creation and Report Authorization Management', 
        'SAP License Allocation and Management', 
        'SAP System Configuration and Add-on Support',
        'SSRS Report Development: - Microsoft Reporting Tools (Auto Mail Creation/ At Scheduled Time)',
        'Troubleshooting SAP Errors and Issues',
        'Requirement Analysis and Solution Implementation',
        'Database Maintenance and Query Optimization',
        'Supporting POS and Integration Systems', 
        'Other Application Issue'
    ]

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
        return ['New', 'Open', 'Reopened'] as TicketStatus[];
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

    // Auto-change status from 'New' to 'Open' when assignee is added
    this.ticketForm.get('assigneeId')?.valueChanges.subscribe(assigneeId => {
      const currentStatus = this.ticketForm.get('status')?.value;
      if (assigneeId && currentStatus === 'New') {
        this.ticketForm.get('status')?.setValue('Open');
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
      this.ticketForm.controls.status.setValue('New');
    } else if (idParam) {
      const ticketId = +idParam;
      const foundTicket = this.apiService.getTicketById(ticketId);
      if (foundTicket) {
        this.ticket.set(foundTicket);
        this.ticketForm.patchValue(foundTicket as any);

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
          this.ticketForm.controls.createdBy.disable();
          this.ticketForm.controls.employeeId.disable();
          this.ticketForm.controls.extensionNumber.disable();
        }
      }
    }
  }

  async onScreenshotUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      this.uploadingScreenshot.set(true);
      const base64 = await this.fileToBase64(file);
      const newScreenshot: ScreenshotItem = { url: base64, fileName: file.name };
      this.screenshots.update(prev => [...prev, newScreenshot]);

      const allScreenshots = this.screenshots();
      this.ticketForm.controls.screenshotUrl.setValue(JSON.stringify(allScreenshots));
      this.ticketForm.controls.screenshotFileName.setValue(file.name);
    } catch (err) {
      console.error('Screenshot upload failed', err);
    } finally {
      this.uploadingScreenshot.set(false);
    }
  }

  removeScreenshot(index: number) {
    this.screenshots.update(prev => prev.filter((_, i) => i !== index));
    const allScreenshots = this.screenshots();
    this.ticketForm.controls.screenshotUrl.setValue(
      allScreenshots.length > 0 ? JSON.stringify(allScreenshots) : null
    );
  }

  /** Download all screenshots one by one */
  downloadAllScreenshots() {
    const shots = this.screenshots();
    shots.forEach((shot, index) => {
      // Stagger downloads slightly to avoid browser blocking
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = shot.url;
        link.download = shot.fileName || `attachment-${index + 1}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 300);
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async saveTicket() {
    if (!this.ticketForm.valid) {
      this.ticketForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      const formValue = this.ticketForm.getRawValue();
      const screenshotUrl = this.screenshots().length > 0 ? JSON.stringify(this.screenshots()) : null;
      const screenshotFileName = this.screenshots()[0]?.fileName || null;

      if (this.isNew()) {
        const newTicket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'> = {
          title: formValue.title ?? '',
          description: formValue.description ?? '',
          status: formValue.status ?? 'New',
          priority: formValue.priority ?? 'Medium',
          category: formValue.category ?? undefined,
          subCategory: formValue.subCategory ?? undefined,
          division: formValue.division ?? undefined,
          reporterId: this.currentUser()?.id ?? 0,
          assigneeId: formValue.assigneeId ?? undefined,
          screenshotUrl: screenshotUrl ?? undefined,
          screenshotFileName: screenshotFileName ?? undefined,
          createdBy: formValue.createdBy ?? undefined,
          employeeId: formValue.employeeId ?? undefined,
          extensionNumber: formValue.extensionNumber ?? undefined,
        };
        await this.apiService.createTicket(newTicket);
      } else {
        const currentTicket = this.ticket();
        if (currentTicket) {
          const updatedTicket: Ticket = {
            ...currentTicket,
            title: formValue.title ?? currentTicket.title,
            description: this.authService.isSupport() && this.supportComment.value
              ? `${currentTicket.description}\n\n[Support Comment - ${new Date().toLocaleString()}]: ${this.supportComment.value}`
              : (formValue.description ?? currentTicket.description),
            status: formValue.status ?? currentTicket.status,
            priority: formValue.priority ?? currentTicket.priority,
            category: formValue.category ?? undefined,
            subCategory: formValue.subCategory ?? undefined,
            division: formValue.division ?? undefined,
            assigneeId: formValue.assigneeId ?? undefined,
            screenshotUrl: screenshotUrl ?? undefined,
            screenshotFileName: screenshotFileName ?? undefined,
            createdBy: formValue.createdBy ?? undefined,
            employeeId: formValue.employeeId ?? undefined,
            extensionNumber: formValue.extensionNumber ?? undefined,
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