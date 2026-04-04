// src/components/user-management/user-management.component.ts  (UPDATED — category field)
import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { User, Role, AppScreen, TicketCategory, TICKET_CATEGORIES, USER_ROLES } from '../../models';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

/** Roles that can be assigned a category scope */
const CATEGORY_SCOPED_ROLES = [
  USER_ROLES.Admin,
  USER_ROLES.HardwareAdmin,
  USER_ROLES.SoftwareAdmin,
  USER_ROLES.SupportAgent,
];

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class UserManagementComponent {
  users;
  roles;
  loading    = signal(false);
  apiLoading;

  activeTab      = signal<'users' | 'roles'>('users');
  isUserModalOpen = signal(false);
  isRoleModalOpen = signal(false);
  editingRole    = signal<Role | null>(null);
  editingUser    = signal<User | null>(null);   // ← for category-edit modal

  availableScreens: AppScreen[] = [
    'Dashboard', 'Tickets', 'User Management', 'Reports', 'Dispatch', 'Customer Entry',
  ];
  selectedPermissions = signal<boolean[]>(new Array(6).fill(false));

  ticketCategories: TicketCategory[] = TICKET_CATEGORIES;

  // ── Create user form ────────────────────────────────────────────────────────
  newUserForm = new FormGroup({
    name:     new FormControl('', Validators.required),
    username: new FormControl('', Validators.required),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    roleId:   new FormControl<number | null>(null, Validators.required),
    category: new FormControl<TicketCategory | null>(null),  // ← NEW
  });

  roleForm = new FormGroup({
    name: new FormControl('', Validators.required),
  });

  // ── Edit user category modal form ───────────────────────────────────────────
  editUserForm = new FormGroup({
    roleId:   new FormControl<number | null>(null, Validators.required),
    category: new FormControl<TicketCategory | null>(null),
  });

  // ── Computed: does the currently selected role need a category? ─────────────
  newUserNeedsCategory = computed(() => {
    const roleId   = this.newUserForm.value.roleId;
    const roleName = this.roles().find(r => r.id === roleId)?.name ?? '';
    return CATEGORY_SCOPED_ROLES.includes(roleName as any);
  });

  editUserNeedsCategory = computed(() => {
    const roleId   = this.editUserForm.value.roleId;
    const roleName = this.roles().find(r => r.id === roleId)?.name ?? '';
    return CATEGORY_SCOPED_ROLES.includes(roleName as any);
  });

  constructor(private apiService: ApiService) {
    this.users     = this.apiService.users;
    this.roles     = this.apiService.roles;
    this.apiLoading = this.apiService.loading;
  }

  getRoleById(id: number)  { return this.roles().find(r => r.id === id); }
  getCategoryBadgeStyle(c?: TicketCategory | null) {
    if (!c) return '';
    const map: Record<TicketCategory, string> = {
      Hardware: 'background:#EFF6FF; color:#1d4ed8;',
      Software: 'background:#F0FDF4; color:#15803d;',
      ASRS:     'background:#FFF7ED; color:#c2410c;',
    };
    return map[c] ?? '';
  }

  // ─── Tab ────────────────────────────────────────────────────────────────────
  selectTab(tab: 'users' | 'roles' | EventTarget | null) {
    const v = (typeof tab === 'string') ? tab : (tab as HTMLSelectElement)?.value;
    if (v === 'users' || v === 'roles') this.activeTab.set(v);
  }

  // ─── Create user modal ───────────────────────────────────────────────────────
  openUserModal() {
    this.newUserForm.reset({ roleId: this.roles()[0]?.id ?? null, category: null });
    this.isUserModalOpen.set(true);
  }

  closeUserModal() { this.isUserModalOpen.set(false); }

  async createUser() {
    if (this.newUserForm.invalid) return;
    this.loading.set(true);
    try {
      const v = this.newUserForm.getRawValue();
      await this.apiService.createUser({
        name:         v.name!,
        username:     v.username!,
        contactEmail: '',
        roleId:       v.roleId!,
        category:     this.newUserNeedsCategory() ? v.category : null,
      } as any);
      this.closeUserModal();
    } catch (err) {
      console.error('Failed to create user', err);
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Edit user modal (role + category) ──────────────────────────────────────
  openEditUserModal(user: User) {
    this.editingUser.set(user);
    this.editUserForm.patchValue({ roleId: user.roleId, category: user.category ?? null });
    this.isUserModalOpen.set(true);   // reuse modal flag
  }

  async saveEditUser() {
    if (this.editUserForm.invalid) return;
    const user = this.editingUser();
    if (!user) return;
    this.loading.set(true);
    try {
      const v = this.editUserForm.getRawValue();
      await this.apiService.updateUser({
        ...user,
        roleId:   v.roleId!,
        category: this.editUserNeedsCategory() ? v.category : null,
      });
      this.closeUserModal();
    } catch (err) {
      console.error('Failed to update user', err);
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Quick role change (inline) ─────────────────────────────────────────────
  async onUserRoleChange(user: User, event: Event) {
    const newRoleId = +(event.target as HTMLSelectElement).value;
    await this.apiService.updateUser({ ...user, roleId: newRoleId });
  }

  // ─── Role modal ─────────────────────────────────────────────────────────────
  openRoleModal(role: Role | null = null) {
    this.editingRole.set(role);
    this.roleForm.reset();
    if (role) {
      this.roleForm.patchValue({ name: role.name });
      this.selectedPermissions.set(this.availableScreens.map(s => role.permissions.includes(s)));
    } else {
      this.selectedPermissions.set(new Array(this.availableScreens.length).fill(false));
    }
    this.isRoleModalOpen.set(true);
  }

  togglePermission(i: number, checked: boolean) {
    const p = [...this.selectedPermissions()];
    p[i] = checked;
    this.selectedPermissions.set(p);
  }

  closeRoleModal() { this.isRoleModalOpen.set(false); this.editingRole.set(null); }

  async saveRole() {
    if (this.roleForm.invalid) return;
    this.loading.set(true);
    const permissions = this.availableScreens.filter((_, i) => this.selectedPermissions()[i]);
    const roleData    = { name: this.roleForm.getRawValue().name!, permissions };
    try {
      const cur = this.editingRole();
      if (cur) await this.apiService.updateRole({ ...cur, ...roleData });
      else      await this.apiService.createRole(roleData);
      this.closeRoleModal();
    } catch (err) {
      console.error('Failed to save role', err);
    } finally {
      this.loading.set(false);
    }
  }
}