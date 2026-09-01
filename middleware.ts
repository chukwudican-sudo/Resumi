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

export default clerkMiddleware(async (auth, request) => {
  if (isPublic(request)) return;

  // Explicit redirect rather than auth.protect(): protect() answers an
  // unauthenticated page request with a 404, which tells someone the page does
  // not exist when the truth is that they need to sign in. Sending them to
  // sign-in — and back afterwards — is the behaviour people expect.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: request.url });
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry
    // search params — a static-looking path with a query is still a request
    // worth authenticating.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
