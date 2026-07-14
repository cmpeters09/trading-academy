import * as z from "zod";

/**
 * ADR-015 — only NEXT_PUBLIC_* vars belong here. SUPABASE_SERVICE_ROLE_KEY
 * and every other privileged secret are Supabase Edge Function secrets, never
 * a Next.js/Vercel env var, so they can't be imported into a Client
 * Component by mistake and never appear in this schema.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");

  throw new Error(
    `Invalid or missing environment variables: ${missing}. See docs/adr/ADR-015-environment-secrets-management.md for what each one is and where it comes from.`,
  );
}

export const env = parsed.data;
