"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { hashPassword } from "@/lib/hash-password";
import {
  errorMessageFromResponse,
  validateRegisterFields,
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

export function RegisterForm({ ...props }: ComponentProps<typeof Card>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const fields = {
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      username: String(form.get("username") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    };

    const validationError = validateRegisterFields(fields);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      const digest = await hashPassword(fields.password);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fields.firstName.trim(),
          lastName: fields.lastName.trim(),
          username: fields.username.trim(),
          email: fields.email.trim(),
          password: digest,
        }),
      });

      if (response.status === 201) {
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
      setError("Unable to register");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your information below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder="Jane"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="Doe"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="jdoe"
                required
                minLength={3}
                maxLength={50}
              />
              <FieldDescription>
                3-50 characters. You can use the same value as your email.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="m@example.com"
                required
              />
              <FieldDescription>
                We&apos;ll use this to contact you. We will not share your email
                with anyone else.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <FieldDescription>
                Must be at least 8 characters long.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <FieldDescription>Please confirm your password.</FieldDescription>
            </Field>
            {error ? (
              <FieldError>{error}</FieldError>
            ) : null}
            <FieldGroup>
              <Field>
                <Button type="submit" disabled={pending}>
                  Create Account
                </Button>
                <FieldDescription className="px-6 text-center">
                  Already have an account? <Link href="/login">Sign in</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
