// Middleware for route protection
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/members', '/profile', '/admin', '/reports'];

// Routes that are always public
const publicRoutes = ['/', '/login', '/unauthorized', '/api', '/verify'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is public
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Check authentication
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Redirect to login if not authenticated
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin routes
  if (pathname.startsWith('/admin')) {
    const allowedAdminRoles = ['admin', 'committee', 'event-staff', 'event-co'];

    if (!allowedAdminRoles.includes(token.role as string)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Event-staff and event-co can only access /admin/events/*
    if (token.role === 'event-staff' || token.role === 'event-co') {
      if (!pathname.startsWith('/admin/events')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
