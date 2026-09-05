import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Everything is private except what is listed here.
 *
 * Stated as an allow-list on purpose: the failure mode of a deny-list is that a
 * route added later is public until somebody notices, and the routes here hold
 * people's work history.
 */
const isPublic = createRouteMatcher([
  '/',                     // the landing page
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',     // Clerk calls this without a session, by design
]);

/**
 * The paths this app actually has.
 *
 * Anything else is a wrong address, and a wrong address should say so. Guarding
 * every unknown path meant a stranger following a stale link was asked to sign
 * in to reach a page that does not exist — and after signing in they would be
 * sent to the same missing page. The 404 never ran.
 *
 * Listed rather than derived because middleware cannot see the route table.
 * A new route added without a line here is answered as missing rather than
 * exposed, which is the safe direction to fail in.
 */
const isKnown = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/onboarding',
  '/setup',
  '/applications(.*)',
  '/insights',
  '/profile',
  '/rules',
  '/interview',
  '/review',
  '/workspace',
  '/api/(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublic(request)) return;

  // Explicit redirect rather than auth.protect(): protect() answers an
  // unauthenticated page request with a 404, which tells someone the page does
  // not exist when the truth is that they need to sign in. Sending them to
  // sign-in — and back afterwards — is the behaviour people expect.
  const { userId, redirectToSignIn } = await auth();
  if (userId) return;

  // A path the app does not have is a wrong address, not a locked door. Let it
  // through to the 404 rather than asking somebody to sign in for a page that
  // will not be there afterwards either.
  if (!isKnown(request)) return;

  // An API call gets an answer it can read. Redirecting a fetch to the sign-in
  // page hands it 200 OK and a page of HTML, so the caller's error handling
  // never fires and the failure surfaces later as an unparseable response.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  return redirectToSignIn({ returnBackUrl: request.url });
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry
    // search params — a static-looking path with a query is still a request
    // worth authenticating.
    '/((?!_next|[^?]*\\.(?:html?|css|m?js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
