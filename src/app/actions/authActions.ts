"use server";

import { AuthService, UserAccount } from "@/lib/services/authService";

export async function loginAction(
  email: string,
  password: string,
  clientIp?: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    return await AuthService.authenticate(email, password, clientIp);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication service failure.";
    return { success: false, error: message };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    await AuthService.logout();
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getSessionUserAction(): Promise<UserAccount | null> {
  try {
    return await AuthService.getCurrentUser();
  } catch {
    return null;
  }
}
