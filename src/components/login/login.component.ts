import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class LoginComponent {
  error   = signal<string | null>(null);
  loading = signal(false);

  // No default values — never pre-fill credentials in source code
  loginForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
  });

  constructor(private router: Router, private authService: AuthService) {}

  async onSubmit() {
    this.error.set(null);
    if (!this.loginForm.valid) return;

    this.loading.set(true);
    const { username, password } = this.loginForm.value;
    try {
      const success = await this.authService.login(username!, password!);
      if (success) {
        this.router.navigate(['/dashboard']);
      } else {
        this.error.set('Invalid username or password.');
      }
    } catch {
      this.error.set('Login failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}