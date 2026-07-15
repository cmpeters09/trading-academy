"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updatePasswordAction } from "../actions";
import { updatePasswordSchema, type UpdatePasswordValues } from "../schemas";

export function UpdatePasswordForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordValues>({ resolver: zodResolver(updatePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    // Redirects on success server-side; reaching here means it failed.
    const result = await updatePasswordAction(values);
    if (!result.ok) {
      setSubmitError(result.error);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormField
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            registration={register("password")}
          />
          <FormField
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            registration={register("confirmPassword")}
          />
          <div aria-live="polite">
            {submitError ? (
              <p role="alert" className="text-danger text-sm">
                {submitError}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Saving..." : "Save new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
