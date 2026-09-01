"use client";

import * as React from "react";
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type McqListItem = {
  id: string;
  name: string;
  description: string;
};

export function McqList() {
  const router = useRouter();
  const [mcqs, setMcqs] = React.useState<McqListItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    const response = await fetch("/api/mcqs");
    const payload = (await response.json()) as {
      mcqs?: McqListItem[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load questions");
      setMcqs([]);
      return;
    }
    setMcqs(payload.mcqs ?? []);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onLogout() {
    setError(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setError("Unable to log out");
    }
  }

  async function onConfirmDelete() {
    if (!deleteId) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/mcqs/${deleteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to delete question");
        return;
      }
      setDeleteId(null);
      await load();
    } catch {
      setError("Unable to delete question");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-medium">Question bank</h1>
          <p className="text-sm text-muted-foreground">
            Create and edit multiple-choice questions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void onLogout()}
          >
            Log out
          </Button>
          <Button
            type="button"
            onClick={() => router.push("/mcqs/new")}
          >
            Create question
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-16">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mcqs === null ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : mcqs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                No questions yet. Create a question to get started.
              </TableCell>
            </TableRow>
          ) : (
            mcqs.map((mcq) => (
              <TableRow key={mcq.id}>
                <TableCell className="font-medium">{mcq.name}</TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {mcq.description || "—"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Actions"
                        />
                      }
                    >
                      <EllipsisVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/mcqs/${mcq.id}/edit`)}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/mcqs/${mcq.id}/preview`)
                        }
                      >
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteId(mcq.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete question</DialogTitle>
            <DialogDescription>
              This permanently removes the question and its choices. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void onConfirmDelete()}
            >
              Delete question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
