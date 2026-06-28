import { z } from "zod";
import { type TaskProgressPayload, type TaskStatus, TaskStatusSchema } from "./messages.js";

export interface TaskEntry {
  text: string;
  status: TaskStatus;
  completed: boolean;
}

const ClaudeTodoWriteSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string(),
      status: TaskStatusSchema,
      activeForm: z.string().optional(),
    }),
  ),
});

const UpdatePlanSchema = z.object({
  plan: z.array(
    z.object({
      step: z.string(),
      status: TaskStatusSchema.catch("pending"),
    }),
  ),
});

/**
 * Normalize a tool name for task-list detection. Kept distinct from
 * protocol's `normalizeToolName` (which only lowercases) because task
 * detection collapses separators so "todo.write" / "todo-write" / "Todo Write"
 * all match "todo_write".
 */
function normalizeTaskToolName(toolName: string): string {
  return toolName
    .trim()
    .replace(/[.\s-]+/g, "_")
    .toLowerCase();
}

/**
 * Extract task entries (with full three-way status) from a task-list tool call.
 * Handles Claude's TodoWrite and Codex's UpdatePlan. Returns null when the tool
 * is not a task list. Shared by the daemon (to persist taskProgress) and the
 * app (to render the inline TodoListCard) so the two never drift.
 */
export function extractTaskEntriesFromToolCall(
  toolName: string,
  input: unknown,
): TaskEntry[] | null {
  const normalized = normalizeTaskToolName(toolName);

  // Claude's plan mode uses ExitPlanMode for the approval prompt; it is not a task list.
  if (normalized === "exitplanmode") {
    return null;
  }

  if (normalized === "todowrite" || normalized === "todo_write") {
    const parsed = ClaudeTodoWriteSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return parsed.data.todos.map((todo) => {
      const status = todo.status;
      const text = todo.activeForm?.trim() || todo.content.trim();
      return {
        text: text.length ? text : todo.content,
        status,
        completed: status === "completed",
      };
    });
  }

  if (normalized === "update_plan") {
    const parsed = UpdatePlanSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return parsed.data.plan
      .map((entry) => ({
        text: entry.step.trim(),
        status: entry.status,
        completed: entry.status === "completed",
      }))
      .filter((entry) => entry.text.length > 0);
  }

  return null;
}

/**
 * Aggregate task entries into a persisted TaskProgress snapshot with counts.
 * `updatedAt` is supplied by the caller (ISO string) so this stays pure.
 */
export function buildTaskProgress(entries: TaskEntry[], updatedAt: string): TaskProgressPayload {
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  for (const entry of entries) {
    if (entry.status === "completed") {
      completed += 1;
    } else if (entry.status === "in_progress") {
      inProgress += 1;
    } else {
      pending += 1;
    }
  }
  return {
    items: entries.map((entry) => ({ text: entry.text, status: entry.status })),
    pending,
    inProgress,
    completed,
    total: entries.length,
    updatedAt,
  };
}
