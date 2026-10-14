import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and Next.js internal paths are always allowed
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("event_auth_session")?.value;
  let user: { id: string; email: string; role: string; fullName: string } | null = null;

  if (sessionCookie) {
    try {
      user = JSON.parse(sessionCookie);
    } catch {
      user = null;
    }
  }

  // 1. Auth Page ("/") is always open and accessible
  if (pathname === "/") {
    return NextResponse.next();
  }

  // 2. Protected Admin Routes (/events, /events/*)
  if (pathname.startsWith("/events")) {
    if (!user) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/scan", request.url));
    }
    return NextResponse.next();
  }

  // 3. Protected Gate Scanner Routes (/scan, /scan/*)
  if (pathname.startsWith("/scan")) {
    if (!user) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 4. Protected API Routes
  if (
    pathname.startsWith("/api/teams") ||
    pathname.startsWith("/api/checkin") ||
    pathname.startsWith("/api/import") ||
    pathname.startsWith("/api/export")
  ) {
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please authenticate first." },
        { status: 401 }
      );
    }
    if ((pathname.startsWith("/api/import") || pathname.startsWith("/api/export")) && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden. Administrator privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/events/:path*",
    "/scan/:path*",
    "/api/teams/:path*",
    "/api/checkin/:path*",
    "/api/import/:path*",
    "/api/export/:path*",
  ],
};

export { proxy as middleware };
export default proxy;
