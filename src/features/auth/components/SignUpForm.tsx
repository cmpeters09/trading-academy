"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

import { signUpAction } from "../actions";
import { signUpSchema, type SignUpValues } from "../schemas";

export function SignUpForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    // Only the browser reliably knows this (ADR-009 — streak day
    // boundaries need the user's real timezone, not a server guess).
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const result = await signUpAction({ ...values, timezone });

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    // "Confirm email" is a Supabase project setting (TD-04), not something
    // this code controls — sessionCreated tells us which happened this
    // time. If it's already on, there's nothing to check an email for.
    if (result.sessionCreated) {
      router.push("/");
      return;
    }

    setSubmitted(true);
  });

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>Confirm your account to finish signing up</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            We sent a confirmation link to your email address. Click it to
            activate your account, then log in.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>Create your Trading Academy account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            registration={register("email")}
          />
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            registration={register("password")}
          />
          <FormField
            id="confirmPassword"
            label="Confirm password"
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
            {isSubmitting ? "Creating account..." : "Sign up"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
