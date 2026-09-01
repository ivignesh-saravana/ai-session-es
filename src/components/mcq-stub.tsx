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

export function McqStub() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  async function onLogout() {
    setError(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setError("Unable to log out");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <h1>Question bank</h1>
        </CardTitle>
        <CardDescription>
          Multiple-choice questions will be created here in the next sprint.
          This page is a stub. Logging out does not lock the page; there is no
          session yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" variant="outline" onClick={onLogout}>
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}
