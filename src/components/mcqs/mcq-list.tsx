"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";

import { errorMessageFromResponse } from "@/lib/auth-form-validation";
import { clearCurrentUserId } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { FieldError } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type McqSummary = {
  id: string;
  name: string;
  question: string;
};

export function McqList() {
  const router = useRouter();
  const [mcqs, setMcqs] = useState<McqSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<McqSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/mcqs");
        if (!response.ok) {
          const message = await errorMessageFromResponse(response);
          if (!cancelled) setError(message);
          return;
        }
        const payload: unknown = await response.json();
        const list =
          payload !== null &&
          typeof payload === "object" &&
          "mcqs" in payload &&
          Array.isArray((payload as { mcqs: unknown }).mcqs)
            ? ((payload as { mcqs: McqSummary[] }).mcqs)
            : [];
        if (!cancelled) {
          setMcqs(list);
        }
      } catch {
        if (!cancelled) setError("Unable to list MCQs");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Unable to log out");
        return;
      }
      clearCurrentUserId();
      router.push("/login");
    } catch {
      setError("Unable to log out");
    } finally {
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/mcqs/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await errorMessageFromResponse(response));
        return;
      }
      setMcqs((current) => current.filter((mcq) => mcq.id !== id));
      setPendingDelete(null);
    } catch {
      setError("Unable to delete MCQ");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>
            <h2>Question bank</h2>
          </CardTitle>
          <CardDescription>Manage multiple-choice questions for the shared test bank.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => router.push("/mcqs/new")}>
            Create MCQ
          </Button>
          <Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
            Log out
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <FieldError>{error}</FieldError> : null}
        {mcqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Question</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mcqs.map((mcq) => (
                <TableRow key={mcq.id}>
                  <TableCell>{mcq.name}</TableCell>
                  <TableCell className="max-w-md truncate">{mcq.question}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${mcq.name}`}
                          />
                        }
                      >
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/mcqs/${mcq.id}/edit`)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/mcqs/${mcq.id}/preview`)}>
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDelete(mcq)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MCQ?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `This will permanently delete “${pendingDelete.name}” and its attempts.`
                : "This will permanently delete the MCQ and its attempts."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
