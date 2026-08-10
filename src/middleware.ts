import { NextResponse, type NextRequest } from "next/server";

// Routes that are always public (no auth required)
const PUBLIC_ROUTES = [
  "/login",
];

export async function middleware(request: NextRequest) {
  // Check for PIN-based session cookie
  const shiftSessionCookie = request.cookies.get("shift_session");
  const authenticated = !!shiftSessionCookie?.value;

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Unauthenticated user trying to access protected route → redirect to /login
  if (!authenticated && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth pages → redirect to dashboard
  if (authenticated && isPublicRoute) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public files (images, icons, manifest)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|logo.png|sitemap.xml|robots.txt).*)",
  ],
};
