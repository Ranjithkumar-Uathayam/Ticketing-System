import { Component, ChangeDetectionStrategy, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Ticket, TicketPriority, TicketStatus, TicketCategory, Division, DIVISIONS } from '../../models';

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

  users;
  currentUser;
  
  ticketForm = new FormGroup({
    title: new FormControl('', Validators.required),
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
  
  readonly pageTitle = computed(() => this.isNew() ? 'Create New Ticket' : `Ticket #${this.ticket()?.id}`);
  
  priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  divisions: Division[] = DIVISIONS;
  
  allStatuses: TicketStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'];
  
  availableStatuses;
  canEditAssignee;

  categories: TicketCategory[] = ['Hardware', 'Software'];
  subCategories: Record<TicketCategory, string[]> = {
    'Hardware': ['Network Issue', 'Application Install', 'System Issue', 'New Mail Account', 'New System Request'],
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

    this.availableStatuses = computed(() => {
      if (this.authService.isEmployee()) {
          return ['Open', 'Reopened'];
      }
      return this.allStatuses;
    });
  
    this.canEditAssignee = computed(() => {
      return this.authService.isAdmin() || this.authService.isManager();
    });

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
      if (!this.canEditAssignee()) {
        this.ticketForm.controls.assigneeId.disable();
      }
      this.ticketForm.get('subCategory')?.disable(); // Initially disable
    } else if (idParam) {
      const ticketId = +idParam;
      const foundTicket = this.apiService.getTicketById(ticketId);
      if (foundTicket) {
        this.ticket.set(foundTicket);
        this.ticketForm.patchValue(foundTicket as any); // Using 'as any' because patchValue has trouble with optional fields being null
        if (foundTicket.category) {
          this.availableSubCategories.set(this.subCategories[foundTicket.category]);
        } else {
           this.ticketForm.get('subCategory')?.disable();
        }
        if (!this.canEditAssignee()) {
          this.ticketForm.controls.assigneeId.disable();
        }
      } else {
        // In a real app, you might want to fetch the ticket if not found in the signal
        this.router.navigate(['/tickets']);
      }
    }
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.ticketForm.patchValue({
          screenshotUrl: e.target?.result as string,
          screenshotFileName: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  }

  removeScreenshot() {
    this.ticketForm.patchValue({
      screenshotUrl: null,
      screenshotFileName: null
    });
  }

  async saveTicket() {
    if (this.ticketForm.invalid) {
      return;
    }
    this.loading.set(true);

    const formValue = this.ticketForm.getRawValue();

    try {
      if (this.isNew()) {
        const newTicketData = {
          ...formValue,
          reporterId: this.currentUser()!.id,
        } as Omit<Ticket, 'id'|'createdAt'|'updatedAt'>;
        await this.apiService.createTicket(newTicketData);
      } else {
        const currentTicket = this.ticket();
        if (currentTicket) {
          const updatedTicket: Ticket = {
            ...currentTicket,
            ...formValue,
          };
          await this.apiService.updateTicket(updatedTicket);
        }
      }
      this.router.navigate(['/tickets']);
    } catch (error) {
      console.error('Failed to save ticket', error);
      // Optionally show an error message to the user
    } finally {
      this.loading.set(false);
    }
  }
  
  cancel() {
    this.router.navigate(['/tickets']);
  }
}
