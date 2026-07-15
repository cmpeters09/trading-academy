import * as z from "zod";

/**
 * ENGINEERING_PRINCIPLES.md §7 — one Zod schema per form, shared between the
 * client (RHF's zodResolver, for inline field errors) and the Server Action
 * (re-validated there too — never trust that client-side validation ran).
 */

// RFC 2606 permanently reserves these domains/TLDs for documentation and
// testing — they can never be real, deliverable addresses, so rejecting
// them can never produce a false positive against a real user's email.
// Narrow and specific on purpose: this is not a general "looks fake" or
// disposable-email filter, which would risk blocking real addresses.
const RESERVED_TEST_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
]);
const RESERVED_TEST_TLDS = [".test", ".example", ".invalid", ".localhost"];

function isReservedTestDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return RESERVED_TEST_DOMAINS.has(domain) || RESERVED_TEST_TLDS.some((tld) => domain.endsWith(tld));
}

const emailSchema = z
  .email("Enter a valid email address")
  .refine((email) => !isReservedTestDomain(email), {
    message: "This domain is reserved for documentation and testing and can't receive email.",
  });

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignUpValues = z.infer<typeof signUpSchema>;

export const logInSchema = z.object({
  // Deliberately the plain z.email() here, not emailSchema: logging in
  // doesn't send mail, so there's no bounce risk, and a reserved-domain
  // check would only add a confusing error to a plain "wrong password" case.
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LogInValues = z.infer<typeof logInSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;
