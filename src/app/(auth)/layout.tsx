/**
 * PROJECT_MAP.md — "(auth)/ unauthenticated shell": deliberately no nav or
 * app chrome here, just the centered form. A user on the login page has
 * nothing to log out of yet and nowhere else in the app to navigate to.
 */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
