export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  isVerified: boolean;
  lastLoginAt?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  error?: string;
  requiresVerification?: boolean;
  email?: string;
  username?: string;
  user?: AuthUser;
  token?: string;
  authenticated?: boolean;
}
