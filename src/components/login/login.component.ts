// src/components/login/login.component.ts  (UPDATED — session expired banner)
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
  error          = signal<string | null>(null);
  loading        = signal(false);
  sessionExpired = signal(false);  // ← NEW: true when redirected after 401

  loginForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
  });

  constructor(private router: Router, private authService: AuthService) {
    // Check if we were redirected here because the session expired (set by the interceptor)
    const nav = this.router.getCurrentNavigation();
    if (nav?.extras?.state?.['sessionExpired'] === true) {
      this.sessionExpired.set(true);
    }
  }

  async onSubmit() {
    this.error.set(null);
    this.sessionExpired.set(false);
    if (!this.loginForm.valid) return;

    this.loading.set(true);
    const { username, password } = this.loginForm.value;
    try {
      const success = await this.authService.login(username!, password!);
      if (success) {
        // Redirect back to the page they were on, or fall back to dashboard
        const returnUrl = (history.state?.['returnUrl'] as string | undefined) ?? '/dashboard';
        this.router.navigateByUrl(returnUrl);
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