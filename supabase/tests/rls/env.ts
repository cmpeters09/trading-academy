import * as z from "zod";

/**
 * Env for the TD-11 RLS isolation test, read from `.env.test.local`
 * (gitignored via `.env*`, created by hand -- never by an agent, ADR-015 §4).
 *
 * Fails loudly on anything missing: a security test that silently skips
 * when unconfigured looks exactly like one that passed.
 */
const ENV_FILE = ".env.test.local";

try {
  process.loadEnvFile(ENV_FILE);
} catch (error) {
  // A missing file is reported below as missing variables (which names
  // every one). Anything else -- e.g. a malformed file -- is surfaced as-is.
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const envSchema = z.object({
  RLS_TEST_SUPABASE_URL: z.url(),
  RLS_TEST_SUPABASE_ANON_KEY: z.string().min(1),
  RLS_TEST_USER_A_EMAIL: z.email(),
  RLS_TEST_USER_A_PASSWORD: z.string().min(1),
  RLS_TEST_USER_B_EMAIL: z.email(),
  RLS_TEST_USER_B_PASSWORD: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");

  throw new Error(
    `RLS isolation test cannot run -- invalid or missing: ${missing}. Set them in ${ENV_FILE} (see TD-11 in docs/engineering/TECHNICAL_DEBT.md).`,
  );
}

/**
 * ADR-015 §3: the service-role/secret key never leaves Edge Functions. It
 * also bypasses RLS entirely, so running this test with it would test
 * nothing. Refuse both key formats: new-style `sb_secret_...` and legacy
 * JWTs whose payload says `"role": "service_role"`.
 */
function assertPublicKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "RLS_TEST_SUPABASE_ANON_KEY is a secret key. Use the anon/publishable key -- the secret key bypasses RLS and must never be used outside Edge Functions (ADR-015 §3).",
    );
  }

  const payload = key.split(".")[1];
  if (payload === undefined) return;

  let role: unknown;
  try {
    role = (
      JSON.parse(Buffer.from(payload, "base64url").toString()) as {
        role?: unknown;
      }
    ).role;
  } catch {
    return; // Not a JWT -- nothing more to check.
  }

  if (role === "service_role") {
    throw new Error(
      "RLS_TEST_SUPABASE_ANON_KEY is the service_role key. Use the anon key -- service_role bypasses RLS and must never be used outside Edge Functions (ADR-015 §3).",
    );
  }
}

assertPublicKey(parsed.data.RLS_TEST_SUPABASE_ANON_KEY);

export const rlsEnv = parsed.data;
