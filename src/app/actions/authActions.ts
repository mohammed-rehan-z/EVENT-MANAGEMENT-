"use server";

import { AuthService, UserAccount } from "@/lib/services/authService";

export async function loginAction(
  email: string,
  password: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    return await AuthService.authenticate(email, password);
  } catch (err: any) {
    return { success: false, error: err.message };
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
