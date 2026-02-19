import { Plus, Trash2, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { NavLink, useFetcher } from "react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  alertHandle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RecordingRecord } from "../db";

interface RecordingHistoryProps {
  recordings: RecordingRecord[];
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const alertDialogHandle = alertHandle<{ id: string }>();

export function RecordingHistory({ recordings }: RecordingHistoryProps) {
  const [isCreating, setIsCreating] = useState(false);
  const fetcher = useFetcher();

  return (
    <div className="flex flex-col h-full flex-[1_1_0] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Recordings
        </span>
        <button
          onClick={() => setIsCreating(true)}
          className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isCreating && (
          <fetcher.Form
            method="post"
            onSubmit={() => {
              flushSync(() => {
                setIsCreating(false);
              });
            }}
            className="p-2 border-b border-border bg-accent/30"
          >
            <input type="hidden" name="action" value="createRecording" />
            <Input
              autoFocus
              placeholder="Name..."
              name="name"
              required
              className="h-7 text-xs bg-input border-border"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsCreating(false);
                }
              }}
            />
            <div className="flex gap-1 mt-1.5">
              <Button
                type="submit"
                size="sm"
                className="h-6 text-[10px] flex-1 uppercase tracking-wider"
              >
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] uppercase tracking-wider"
                onClick={() => {
                  setIsCreating(false);
                }}
              >
                Esc
              </Button>
            </div>
          </fetcher.Form>
        )}

        {recordings.length === 0 && !isCreating && (
          <div className="text-center py-12 px-4">
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">
              Empty
            </p>
          </div>
        )}

        {recordings.map((rec) => (
          <NavLink
            key={rec.id}
            to={`/${rec.id}`}
            className={({ isActive }) =>
              `group flex items-center justify-between px-3 py-2 border-l-2 transition-colors ${
                isActive
                  ? "border-l-primary bg-accent/60 text-foreground"
                  : "border-l-transparent hover:bg-accent/30 text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{rec.name}</div>
              <div className="text-[10px] text-muted-foreground/60 font-mono">
                {formatDate(rec.created_at)}
              </div>
            </div>
            <AlertDialogTrigger
              handle={alertDialogHandle}
              payload={{ id: rec.id }}
              className="h-6 w-6 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
            >
              <Trash2 className="h-3 w-3" />
            </AlertDialogTrigger>
          </NavLink>
        ))}
      </div>
      <AlertDialog handle={alertDialogHandle}>
        {({ payload }) => (
          <AlertDialogContent>
            {/* oxlint-disable-next-line typescript/no-use-before-define */}
            <DeleteRecordingContent id={payload?.id} />
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

const DeleteRecordingContent = ({ id }: { id: string | undefined }) => {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="action" value="deleteRecording" />
      <input type="hidden" name="id" value={id} />
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
          <Trash2Icon />
        </AlertDialogMedia>
        <AlertDialogTitle>Delete recording?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete this recording.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" variant="destructive">
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </fetcher.Form>
  );
};
