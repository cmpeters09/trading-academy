import { Suspense } from "react";

import { LogInForm } from "@/features/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LogInForm />
    </Suspense>
  );
}
