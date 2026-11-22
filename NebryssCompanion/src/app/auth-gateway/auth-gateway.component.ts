import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ToastService } from '../toast.service';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

@Component({
  selector: 'app-auth-gateway',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-gateway.component.html',
  styleUrls: ['./auth-gateway.component.css']
})
export class AuthGatewayComponent implements OnInit, OnDestroy {
  mode: AuthMode = 'login';
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Form Fields
  loginIdentifier = '';
  loginPassword = '';

  registerEmail = '';
  registerPassword = '';
  registerConfirmPassword = '';

  verifyEmail = '';
  verifyCode = '';

  resetEmail = '';
  resetCode = '';
  resetPassword = '';
  resetConfirmPassword = '';

  // Resend Timer
  resendCooldown = 0;
  private timerInterval: any = null;

  constructor(
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {}

  setMode(newMode: AuthMode): void {
    this.mode = newMode;
    this.errorMessage = '';
    this.successMessage = '';
  }

  onLogin(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.loginIdentifier.trim() || !this.loginPassword) {
      this.errorMessage = 'Please enter your email address and password.';
      return;
    }

    this.isLoading = true;
    this.authService.login(this.loginIdentifier, this.loginPassword).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.toastService.show('Authentication successful! Welcome to Nebryss.', 'success');
        } else if (res.requiresVerification) {
          this.verifyEmail = res.email || this.loginIdentifier;
          this.setMode('verify');
          this.errorMessage = res.message || 'Please verify your email address to proceed.';
        }
      },
      error: (err) => {
        this.isLoading = false;
        const errBody = err.error || {};
        if (err.status === 403 && errBody.requiresVerification) {
          this.verifyEmail = errBody.email || this.loginIdentifier;
          this.setMode('verify');
          this.errorMessage = errBody.error || 'Please verify your email address.';
        } else {
          this.errorMessage = errBody.error || 'Invalid credentials or connection error.';
        }
      }
    });
  }

  onRegister(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const email = this.registerEmail.trim();
    const password = this.registerPassword;
    const confirm = this.registerConfirmPassword;

    if (!email || !password) {
      this.errorMessage = 'All fields are required.';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.errorMessage = 'Please provide a valid email address.';
      return;
    }

    if (password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters long.';
      return;
    }

    if (password !== confirm) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.isLoading = true;
    this.authService.register(email, password).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.verifyEmail = email;
          this.setMode('verify');
          this.successMessage = 'Account registered! We sent a 6-digit verification code to your email.';
          this.startResendCountdown();
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'Registration failed. Please try again.';
      }
    });
  }

  onVerify(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const email = this.verifyEmail.trim();
    const code = this.verifyCode.trim();

    if (!email || !code) {
      this.errorMessage = 'Please enter the 6-digit verification code.';
      return;
    }

    this.isLoading = true;
    this.authService.validateEmail(email, code).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.toastService.show('Email verified successfully! Session established.', 'success');
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'Invalid or expired verification code.';
      }
    });
  }

  onResendCode(): void {
    if (this.resendCooldown > 0 || !this.verifyEmail.trim()) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resendCode(this.verifyEmail).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMessage = 'A new 6-digit code has been dispatched to your email.';
        this.startResendCountdown();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'Failed to resend verification code.';
      }
    });
  }

  openForgotPassword(): void {
    const id = this.loginIdentifier.trim();
    if (id.includes('@')) {
      this.resetEmail = id;
    }
    this.setMode('forgot');
  }

  onForgotPassword(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const email = this.resetEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.errorMessage = 'Please enter the email address of your account.';
      return;
    }

    this.isLoading = true;
    this.authService.requestPasswordReset(email).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.resetCode = '';
        this.resetPassword = '';
        this.resetConfirmPassword = '';
        this.setMode('reset');
        this.successMessage = res.message || 'If an account exists for that email, a 6-digit reset code has been sent to it.';
        this.startResendCountdown();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'Failed to request a reset code. Please try again.';
      }
    });
  }

  onResendResetCode(): void {
    if (this.resendCooldown > 0 || !this.resetEmail.trim()) return;
    this.onForgotPassword();
  }

  onResetPassword(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const email = this.resetEmail.trim();
    const code = this.resetCode.trim();
    const password = this.resetPassword;

    if (!email || !code) {
      this.errorMessage = 'Please enter the 6-digit reset code from your email.';
      return;
    }

    if (password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters long.';
      return;
    }

    if (password !== this.resetConfirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.isLoading = true;
    this.authService.resetPassword(email, code, password).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success) {
          this.toastService.show('Password updated! Welcome back to Nebryss.', 'success');
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || 'Invalid or expired reset code.';
      }
    });
  }

  private startResendCountdown(): void {
    this.resendCooldown = 60;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
