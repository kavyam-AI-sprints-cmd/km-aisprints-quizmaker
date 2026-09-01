"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { hashPassword } from "@/lib/hash-password";
import {
  errorMessageFromResponse,
  validateLoginFields,
} from "@/lib/auth-form-validation";
import { rememberUserIdFromPayload } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  className,
  ...props
}: ComponentProps<"div">) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");

    const validationError = validateLoginFields(username, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      const digest = await hashPassword(password);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: digest }),
      });

      if (response.status === 200) {
        try {
          rememberUserIdFromPayload(await response.json());
        } catch {
          // Navigate even if the payload cannot be parsed.
        }
        router.push("/mcqs");
        return;
      }

      setError(await errorMessageFromResponse(response));
    } catch {
      setError("Unable to login");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Log in to Quiz Maker</CardTitle>
          <CardDescription>
            Enter your username below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="jdoe"
                  required
                />
                <FieldDescription>
                  Use the username you chose at registration. Your email works
                  only if you registered with the same value.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </Field>
              {error ? (
                <FieldError>{error}</FieldError>
              ) : null}
              <Field>
                <Button type="submit" disabled={pending}>
                  Login
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account? <Link href="/register">Sign up</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
