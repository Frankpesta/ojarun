/**
 * Clerk → Convex. In Clerk, create a JWT template named "convex" and add the claim
 *   "phone_number": "{{user.primary_phone_number}}"
 * Then set CLERK_JWT_ISSUER_DOMAIN on the Convex deployment (the template's issuer URL).
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
