import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Everything except sign-in needs a Clerk session. The ops *role* is enforced by Convex on every
 * function and by the dashboard gate; this only keeps signed-out visitors out.
 */
const isPublic = createRouteMatcher(["/sign-in(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
