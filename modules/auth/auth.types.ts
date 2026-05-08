export type AuthRole = "admin" | "member";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AllowedUser {
  id: string;
  email: string;
  role: AuthRole;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  role: AuthRole;
  createdAt: string;
}
