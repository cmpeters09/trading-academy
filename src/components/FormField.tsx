import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormFieldProps = {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  error?: string | undefined;
  registration: UseFormRegisterReturn;
  /** e.g. a "Forgot your password?" link next to the Password label. */
  labelAction?: ReactNode;
};

/**
 * ENGINEERING_PRINCIPLES.md §11 — every field: a real <label htmlFor>, the
 * error linked via aria-describedby, and aria-invalid set so the input's
 * own destructive styling kicks in. Shared because every form this session
 * (sign up, log in, forgot password, update password) repeats this exact
 * shape — the rule of three, cleared within one session.
 */
export function FormField({
  id,
  label,
  type = "text",
  autoComplete,
  error,
  registration,
  labelAction,
}: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...registration}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
