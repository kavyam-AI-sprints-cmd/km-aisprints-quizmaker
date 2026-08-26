"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";

export function McqStub() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Unable to log out");
        return;
      }
      router.push("/login");
    } catch {
      setError("Unable to log out");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Question bank</h1>
        </CardTitle>
        <CardDescription>
          The MCQ test bank will be built in a later sprint.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}
