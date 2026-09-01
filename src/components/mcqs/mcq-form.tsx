"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { errorMessageFromResponse } from "@/lib/auth-form-validation";
import { getCurrentUserId } from "@/lib/current-user";
import { validateMcqForm } from "@/lib/mcq-form-validation";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type ChoiceDraft = {
  id?: string;
  text: string;
  isCorrect: boolean;
};

type McqFormProps = {
  mode: "create" | "edit";
  mcqId?: string;
};

function emptyChoices(): ChoiceDraft[] {
  return [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ];
}

export function McqForm({ mode, mcqId }: McqFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState<ChoiceDraft[]>(emptyChoices);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !mcqId) {
      return;
    }

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
        const mcq =
          payload !== null && typeof payload === "object" && "mcq" in payload
            ? (payload as { mcq: {
                name: string;
                question: string;
                choices: { id: string; text: string; isCorrect: boolean }[];
              } }).mcq
            : null;
        if (!mcq || cancelled) return;
        setName(mcq.name);
        setQuestion(mcq.question);
        setChoices(
          mcq.choices.map((choice) => ({
            id: choice.id,
            text: choice.text,
            isCorrect: choice.isCorrect,
          })),
        );
      } catch {
        if (!cancelled) setError("Unable to load MCQ");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, mcqId]);

  function addChoice() {
    if (choices.length >= 6) return;
    setChoices((current) => [...current, { text: "", isCorrect: false }]);
  }

  function removeChoice(index: number) {
    if (choices.length <= 2) return;
    setChoices((current) => {
      const next = current.filter((_, i) => i !== index);
      if (!next.some((choice) => choice.isCorrect) && next[0]) {
        next[0] = { ...next[0], isCorrect: true };
      }
      return next;
    });
  }

  function updateChoiceText(index: number, text: string) {
    setChoices((current) =>
      current.map((choice, i) => (i === index ? { ...choice, text } : choice)),
    );
  }

  function markCorrect(index: number) {
    setChoices((current) =>
      current.map((choice, i) => ({ ...choice, isCorrect: i === index })),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateMcqForm({ name, question, choices });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (mode === "create") {
      const createdByUserId = getCurrentUserId();
      if (!createdByUserId) {
        setError("Sign in to create an MCQ");
        return;
      }

      setPending(true);
      try {
        const response = await fetch("/api/mcqs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            question: question.trim(),
            createdByUserId,
            choices: choices.map((choice) => ({
              text: choice.text.trim(),
              isCorrect: choice.isCorrect,
            })),
          }),
        });
        if (response.status === 201) {
          router.push("/mcqs");
          return;
        }
        setError(await errorMessageFromResponse(response));
      } catch {
        setError("Unable to create MCQ");
      } finally {
        setPending(false);
      }
      return;
    }

    if (!mcqId) {
      setError("MCQ id is required");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/mcqs/${mcqId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          question: question.trim(),
          choices: choices.map((choice) => ({
            ...(choice.id ? { id: choice.id } : {}),
            text: choice.text.trim(),
            isCorrect: choice.isCorrect,
          })),
        }),
      });
      if (response.status === 200) {
        router.push("/mcqs");
        return;
      }
      setError(await errorMessageFromResponse(response));
    } catch {
      setError("Unable to update MCQ");
    } finally {
      setPending(false);
    }
  }

  const correctValue = String(choices.findIndex((choice) => choice.isCorrect));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{mode === "create" ? "Create MCQ" : "Edit MCQ"}</h2>
        </CardTitle>
        <CardDescription>
          {mode === "create"
            ? "Add a multiple-choice question with two to six choices."
            : "Update the question and its choices."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="question">Question</FieldLabel>
              <Textarea
                id="question"
                name="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                required
              />
            </Field>
            <FieldSet>
              <FieldLegend>Choices</FieldLegend>
              <RadioGroup
                value={correctValue}
                onValueChange={(value) => markCorrect(Number(value))}
                aria-label="Correct answer"
              >
                {choices.map((choice, index) => (
                  <div key={choice.id ?? `new-${index}`} className="flex items-start gap-2">
                    <RadioGroupItem
                      value={String(index)}
                      aria-label={`Choice ${index + 1} is correct`}
                    />
                    <Field className="gap-1">
                      <FieldLabel htmlFor={`choice-${index}`}>Choice {index + 1}</FieldLabel>
                      <div className="flex min-w-0 gap-2">
                        <Input
                          id={`choice-${index}`}
                          className="min-w-0 flex-1"
                          value={choice.text}
                          onChange={(event) => updateChoiceText(index, event.target.value)}
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeChoice(index)}
                          disabled={choices.length <= 2}
                        >
                          Remove choice {index + 1}
                        </Button>
                      </div>
                    </Field>
                  </div>
                ))}
              </RadioGroup>
              <Button
                type="button"
                variant="outline"
                onClick={addChoice}
                disabled={choices.length >= 6}
              >
                Add choice
              </Button>
            </FieldSet>
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="grid w-full grid-cols-2 gap-2">
              <Button type="submit" className="w-full" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/mcqs")}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
