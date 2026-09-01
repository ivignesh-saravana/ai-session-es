"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ChoiceDraft = {
  label: string;
  isCorrect: boolean;
};

const emptyChoices = (): ChoiceDraft[] => [
  { label: "", isCorrect: true },
  { label: "", isCorrect: false },
];

export function McqForm({ questionId }: { questionId?: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [choices, setChoices] = React.useState<ChoiceDraft[]>(emptyChoices);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(questionId));

  React.useEffect(() => {
    if (!questionId) {
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/mcqs/${questionId}`);
        const payload = (await response.json()) as {
          name?: string;
          description?: string;
          choices?: { label: string; isCorrect: boolean }[];
          error?: string;
        };
        if (!response.ok) {
          if (!cancelled) {
            setError(payload.error ?? "Question not found");
          }
          return;
        }
        if (cancelled) {
          return;
        }
        setName(payload.name ?? "");
        setDescription(payload.description ?? "");
        setChoices(
          (payload.choices ?? emptyChoices()).map((choice) => ({
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
        );
      } catch {
        if (!cancelled) {
          setError("Unable to load question");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  function setCorrect(index: number) {
    setChoices((current) =>
      current.map((choice, choiceIndex) => ({
        ...choice,
        isCorrect: choiceIndex === index,
      })),
    );
  }

  function addChoice() {
    setChoices((current) =>
      current.length >= 6
        ? current
        : [...current, { label: "", isCorrect: false }],
    );
  }

  function removeChoice(index: number) {
    setChoices((current) => {
      if (current.length <= 2) {
        return current;
      }
      const next = current.filter((_, choiceIndex) => choiceIndex !== index);
      if (!next.some((choice) => choice.isCorrect)) {
        next[0] = { ...next[0], isCorrect: true };
      }
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedChoices = choices.map((choice) => ({
      label: choice.label.trim(),
      isCorrect: choice.isCorrect,
    }));

    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (trimmedChoices.length < 2 || trimmedChoices.length > 6) {
      setError("Use between two and six choices");
      return;
    }
    if (trimmedChoices.some((choice) => !choice.label)) {
      setError("Choice labels cannot be blank");
      return;
    }
    if (trimmedChoices.filter((choice) => choice.isCorrect).length !== 1) {
      setError("Exactly one choice must be marked correct");
      return;
    }

    setPending(true);
    try {
      const url = questionId ? `/api/mcqs/${questionId}` : "/api/mcqs";
      const response = await fetch(url, {
        method: questionId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          choices: trimmedChoices,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to save question");
        return;
      }
      router.push("/mcqs");
    } catch {
      setError("Unable to save question");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h1>{questionId ? "Edit question" : "Create question"}</h1>
        </CardTitle>
        <CardDescription>
          Two to six choices. Mark exactly one as the correct answer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mcq-name">Name</FieldLabel>
                <Input
                  id="mcq-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mcq-description">Description</FieldLabel>
                <Textarea
                  id="mcq-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {choices.map((choice, index) => (
                <Field key={index}>
                  <FieldLabel htmlFor={`mcq-choice-${index}`}>
                    Choice {index + 1}
                  </FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id={`mcq-choice-${index}`}
                      value={choice.label}
                      onChange={(event) =>
                        setChoices((current) =>
                          current.map((item, choiceIndex) =>
                            choiceIndex === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="radio"
                        name="correct-choice"
                        checked={choice.isCorrect}
                        onChange={() => setCorrect(index)}
                        aria-label="Correct"
                      />
                      Correct
                    </label>
                    {choices.length > 2 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeChoice(index)}
                      >
                        Remove choice
                      </Button>
                    ) : null}
                  </div>
                </Field>
              ))}
            </FieldGroup>
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={choices.length >= 6}
                onClick={addChoice}
              >
                Add choice
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/mcqs")}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
