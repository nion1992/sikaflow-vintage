import type { AuthConfig } from "convex/server";

/**
 * Convex verifies Supabase access tokens as a custom JWT provider.
 *
 * Requirements on the Supabase side:
 *  - The project must sign JWTs with an asymmetric key (ES256 or RS256).
 *    Supabase → Authentication → JWT Keys → enable the new signing keys.
 *    Convex cannot verify legacy HS256 shared secrets.
 *  - The JWKS endpoint must be public: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *
 * Set this on the Convex deployment (`npx convex env set NAME value`):
 *  - SUPABASE_URL   e.g. https://abcdefgh.supabase.co
 *
 * The algorithm and audience are literal here because Convex requires every
 * env var referenced in this file to be set. Change ALGORITHM to "RS256" if
 * your project's signing key uses RS256.
 */
const ALGORITHM = "ES256" as const;
const AUDIENCE = "authenticated";
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  ""
).replace(/\/+$/, "");

if (!supabaseUrl) {
  throw new Error(
    "SUPABASE_URL is not set on the Convex deployment, so Supabase access tokens cannot be verified. Run: npx convex env set SUPABASE_URL https://<project>.supabase.co",
  );
}

export default {
  providers: [
    {
      type: "customJwt",
      issuer: `${supabaseUrl}/auth/v1`,
      jwks: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      algorithm: ALGORITHM,
      applicationID: AUDIENCE,
    },
  ],
} satisfies AuthConfig;
