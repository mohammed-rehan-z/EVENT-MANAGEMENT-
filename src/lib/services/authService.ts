import { cookies } from "next/headers";

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "VOLUNTEER";
  avatar: string;
}

// Built-in configured credentials for the Event Management Platform
const DEFAULT_USERS: Array<UserAccount & { passwordHash: string }> = [
  {
    id: "usr-admin-1",
    email: "admin@eventportal.com",
    passwordHash: "admin123", // In high-security prod, use bcrypt; for this platform, verified match
    fullName: "Alex Mercer",
    role: "ADMIN",
    avatar: "AM",
  },
  {
    id: "usr-volunteer-1",
    email: "volunteer@eventportal.com",
    passwordHash: "volunteer123",
    fullName: "Jordan Lee",
    role: "VOLUNTEER",
    avatar: "JL",
  },
];

const COOKIE_NAME = "event_auth_session";

export class AuthService {
  /**
   * Verifies user email and password
   */
  static async authenticate(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const matched = DEFAULT_USERS.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === cleanPassword
    );

    if (!matched) {
      return {
        success: false,
        error: "Invalid account name or password. Please check your credentials.",
      };
    }

    const { passwordHash, ...user } = matched;

    // Set HTTP-only session cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return {
      success: true,
      user,
    };
  }

  /**
   * Reads current user session from cookies
   */
  static async getCurrentUser(): Promise<UserAccount | null> {
    try {
      const cookieStore = await cookies();
      const session = cookieStore.get(COOKIE_NAME);
      if (!session || !session.value) return null;
      return JSON.parse(session.value) as UserAccount;
    } catch {
      return null;
    }
  }

  /**
   * Destroys current session and logs out
   */
  static async logout(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  }
}
