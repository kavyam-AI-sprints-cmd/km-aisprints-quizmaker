"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { errorMessageFromResponse } from "@/lib/auth-form-validation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PreviewChoice = {
  id: string;
  text: string;
};

type PreviewMcq = {
  id: string;
  name: string;
  question: string;
  choices: PreviewChoice[];
};

export function McqPreview({ mcqId }: { mcqId: string }) {
  const router = useRouter();
  const [mcq, setMcq] = useState<PreviewMcq | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>("");
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/mcqs/${mcqId}`);
        if (!response.ok) {
          const message = await errorMessageFromResponse(response);
          if (!cancelled) setError(message);
          return;
        }
        const payload: unknown = await response.json();
        const loaded =
          payload !== null && typeof payload === "object" && "mcq" in payload
            ? (payload as { mcq: PreviewMcq }).mcq
            : null;
        if (!cancelled) {
          setMcq(loaded);
        }
      } catch {
        if (!cancelled) setError("Unable to load MCQ");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mcqId]);

  async function onCheckAnswer() {
    if (!selectedChoiceId) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/mcqs/${mcqId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choiceId: selectedChoiceId }),
      });
      if (response.status !== 201) {
        setError(await errorMessageFromResponse(response));
        return;
      }
      const payload: unknown = await response.json();
      const isCorrect =
        payload !== null &&
        typeof payload === "object" &&
        "attempt" in payload &&
        typeof (payload as { attempt?: { isCorrect?: unknown } }).attempt?.isCorrect ===
          "boolean"
          ? Boolean((payload as { attempt: { isCorrect: boolean } }).attempt.isCorrect)
          : false;
      setResult(isCorrect ? "correct" : "incorrect");
    } catch {
      setError("Unable to record attempt");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{mcq?.name ?? "Preview"}</h2>
        </CardTitle>
        {mcq ? <CardDescription>{mcq.question}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {mcq ? (
            <RadioGroup
              value={selectedChoiceId}
              onValueChange={setSelectedChoiceId}
              aria-label="Your answer"
            >
              {mcq.choices.map((choice) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <RadioGroupItem value={choice.id} aria-label={choice.text} />
                  <span aria-hidden="true">{choice.text}</span>
                </div>
              ))}
            </RadioGroup>
          ) : null}
          {result === "correct" ? <p>Correct</p> : null}
          {result === "incorrect" ? <p>Incorrect</p> : null}
          {error ? <FieldError>{error}</FieldError> : null}
          <Field className="flex-row gap-2">
            <Button type="button" onClick={onCheckAnswer} disabled={pending}>
              Check answer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/mcqs")}
              disabled={pending}
            >
              Back
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
