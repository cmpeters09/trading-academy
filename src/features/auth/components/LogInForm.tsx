"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

import { logInAction } from "../actions";
import { logInSchema, type LogInValues } from "../schemas";

export function LogInForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const confirmError = searchParams.get("error");
  const next = searchParams.get("next");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LogInValues>({ resolver: zodResolver(logInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    // logInAction redirects on success (back to `next`, the route
    // middleware bounced the user from, or "/"); reaching this line at all
    // means it returned instead of redirecting, which only happens on
    // failure.
    const result = await logInAction({ ...values, next: next ?? undefined });
    if (!result.ok) {
      setSubmitError(result.error);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back</CardDescription>
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
            autoComplete="current-password"
            error={errors.password?.message}
            registration={register("password")}
            labelAction={
              <Link
                href="/forgot-password"
                className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>
            }
          />
          <div aria-live="polite">
            {(submitError ?? confirmError) ? (
              <p role="alert" className="text-danger text-sm">
                {submitError ?? confirmError}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Logging in..." : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
