import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { User, Role, AppScreen } from '../../models';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

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
  loading = signal(false);
  apiLoading;

  activeTab = signal<'users' | 'roles'>('users');

  isUserModalOpen = signal(false);
  isRoleModalOpen = signal(false);

  editingRole = signal<Role | null>(null);

  availableScreens: AppScreen[] = ['Dashboard', 'Tickets', 'User Management', 'Reports'];

  // Tracks which permissions are checked — simple boolean array, no FormArray
  selectedPermissions = signal<boolean[]>([false, false, false, false]);

  // contactEmail removed from the form
  newUserForm = new FormGroup({
    name:     new FormControl('', Validators.required),
    username: new FormControl('', Validators.required),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    roleId:   new FormControl<number | null>(null, Validators.required),
  });

  roleForm = new FormGroup({
    name: new FormControl('', Validators.required),
  });

  constructor(private apiService: ApiService) {
    this.users = this.apiService.users;
    this.roles = this.apiService.roles;
    this.apiLoading = this.apiService.loading;
  }

  getRoleById(id: number) {
    return this.roles().find(r => r.id === id);
  }

  // --- Tab Control ---
  selectTab(tab: 'users' | 'roles' | EventTarget | null) {
    const value = (typeof tab === 'string') ? tab : (tab as HTMLSelectElement)?.value;
    if (value === 'users' || value === 'roles') {
      this.activeTab.set(value);
    }
  }

  // --- User Management ---
  openUserModal() {
    this.newUserForm.reset({ roleId: this.roles()[0]?.id ?? null });
    this.isUserModalOpen.set(true);
  }

  closeUserModal() {
    this.isUserModalOpen.set(false);
  }

  async createUser() {
    if (this.newUserForm.invalid) return;
    this.loading.set(true);
    try {
      await this.apiService.createUser(this.newUserForm.getRawValue() as any);
      this.closeUserModal();
    } catch (error) {
      console.error('Failed to create user', error);
    } finally {
      this.loading.set(false);
    }
  }

  async onUserRoleChange(user: User, event: Event) {
    const newRoleId = +(event.target as HTMLSelectElement).value;
    const updatedUser = { ...user, roleId: newRoleId };
    await this.apiService.updateUser(updatedUser);
  }

  // --- Role Management ---
  openRoleModal(role: Role | null = null) {
    this.editingRole.set(role);
    this.roleForm.reset();

    if (role) {
      this.roleForm.patchValue({ name: role.name });
      // Pre-check boxes based on existing role permissions
      this.selectedPermissions.set(
        this.availableScreens.map(screen => role.permissions.includes(screen))
      );
    } else {
      this.selectedPermissions.set(this.availableScreens.map(() => false));
    }

    this.isRoleModalOpen.set(true);
  }

  togglePermission(index: number, checked: boolean) {
    const current = [...this.selectedPermissions()];
    current[index] = checked;
    this.selectedPermissions.set(current);
  }

  closeRoleModal() {
    this.isRoleModalOpen.set(false);
    this.editingRole.set(null);
  }

  async saveRole() {
    if (this.roleForm.invalid) return;
    this.loading.set(true);

    // Build permissions list from the simple boolean signal array
    const checkedPermissions = this.availableScreens.filter(
      (_, i) => this.selectedPermissions()[i] === true
    );

    const roleData = {
      name:        this.roleForm.getRawValue().name!,
      permissions: checkedPermissions,
    };

    try {
      const currentRole = this.editingRole();
      if (currentRole) {
        await this.apiService.updateRole({ ...currentRole, ...roleData });
      } else {
        await this.apiService.createRole(roleData);
      }
      this.closeRoleModal();
    } catch (error) {
      console.error('Failed to save role', error);
    } finally {
      this.loading.set(false);
    }
  }
}