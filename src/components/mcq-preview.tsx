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
import { FieldError } from "@/components/ui/field";

type PreviewChoice = {
  id: string;
  label: string;
  position: number;
};

type PreviewMcq = {
  id: string;
  name: string;
  description: string;
  choices: PreviewChoice[];
};

export function McqPreview({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [mcq, setMcq] = React.useState<PreviewMcq | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const response = await fetch(`/api/mcqs/${questionId}/preview`);
        const payload = (await response.json()) as PreviewMcq & {
          error?: string;
        };
        if (!response.ok) {
          if (!cancelled) {
            setError(payload.error ?? "Question not found");
          }
          return;
        }
        if (!cancelled) {
          setMcq(payload);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load preview");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || result !== null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/mcqs/${questionId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choiceId: selectedId }),
      });
      const payload = (await response.json()) as {
        isCorrect?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to submit answer");
        return;
      }
      setResult(Boolean(payload.isCorrect));
    } catch {
      setError("Unable to submit answer");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h1>{mcq?.name ?? "Preview"}</h1>
        </CardTitle>
        {mcq?.description ? (
          <CardDescription>{mcq.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <FieldError>{error}</FieldError> : null}
        {mcq ? (
          result === null ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Choices</legend>
                {mcq.choices.map((choice) => (
                  <label
                    key={choice.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="preview-choice"
                      value={choice.id}
                      checked={selectedId === choice.id}
                      onChange={() => setSelectedId(choice.id)}
                    />
                    {choice.label}
                  </label>
                ))}
              </fieldset>
              <Button type="submit" disabled={pending || !selectedId}>
                Submit
              </Button>
            </form>
          ) : (
            <p className="text-sm font-medium">
              {result ? "Correct" : "Incorrect"}
            </p>
          )
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/mcqs")}
        >
          Back
        </Button>
      </CardContent>
    </Card>
  );
}
