import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/onboarding",
    "/imports/:path*",
    "/products/:path*",
    "/metrics/:path*",
    "/evaluations/:path*",
    "/experiments/:path*",
    "/queue/:path*",
    "/settings/:path*",
  ],
};
