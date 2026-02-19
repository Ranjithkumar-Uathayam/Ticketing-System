import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { User, Role, AppScreen } from '../../models';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

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

  // contactEmail removed from the form
  newUserForm = new FormGroup({
    name:     new FormControl('', Validators.required),
    username: new FormControl('', Validators.required),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    roleId:   new FormControl<number | null>(null, Validators.required),
  });

  roleForm = new FormGroup({
    name:        new FormControl('', Validators.required),
    permissions: new FormArray(this.availableScreens.map(() => new FormControl(false))),
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

    const permissionsArray = this.roleForm.get('permissions') as FormArray;
    permissionsArray.clear();

    if (role) {
      this.roleForm.patchValue({ name: role.name });
      this.availableScreens.forEach(screen => {
        permissionsArray.push(new FormControl(role.permissions.includes(screen)));
      });
    } else {
      this.availableScreens.forEach(() => permissionsArray.push(new FormControl(false)));
    }

    this.isRoleModalOpen.set(true);
  }

  closeRoleModal() {
    this.isRoleModalOpen.set(false);
    this.editingRole.set(null);
  }

  async saveRole() {
    if (this.roleForm.invalid) return;
    this.loading.set(true);

    const selectedPermissions = this.availableScreens.filter(
      (_, i) => this.roleForm.value.permissions?.[i]
    );

    const roleData = {
      name:        this.roleForm.value.name!,
      permissions: selectedPermissions,
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