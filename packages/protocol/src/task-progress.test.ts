import { describe, expect, it } from "vitest";

import { buildTaskProgress, extractTaskEntriesFromToolCall } from "./task-progress.js";

describe("extractTaskEntriesFromToolCall", () => {
  it("extracts TodoWrite entries with three-way status", () => {
    const tasks = extractTaskEntriesFromToolCall("TodoWrite", {
      todos: [
        { content: "Task 1", status: "pending" },
        { content: "Task 2", status: "in_progress" },
        { content: "Task 3", status: "completed" },
      ],
    });

    expect(tasks?.map((task) => task.status)).toEqual(["pending", "in_progress", "completed"]);
    expect(tasks?.map((task) => task.completed)).toEqual([false, false, true]);
  });

  it("prefers activeForm over content for the text", () => {
    const tasks = extractTaskEntriesFromToolCall("TodoWrite", {
      todos: [{ content: "Write tests", status: "in_progress", activeForm: "Writing tests" }],
    });

    expect(tasks?.[0]?.text).toBe("Writing tests");
  });

  it("normalizes separator variants of the tool name", () => {
    for (const name of ["todo.write", "todo-write", "Todo Write", "todo_write"]) {
      expect(extractTaskEntriesFromToolCall(name, { todos: [] })).toEqual([]);
    }
  });

  it("returns null for non task-list tools and ExitPlanMode", () => {
    expect(extractTaskEntriesFromToolCall("Bash", { command: "ls" })).toBeNull();
    expect(extractTaskEntriesFromToolCall("ExitPlanMode", { plan: "x" })).toBeNull();
  });

  it("parses Codex UpdatePlan steps", () => {
    const tasks = extractTaskEntriesFromToolCall("update_plan", {
      plan: [
        { step: "Investigate", status: "completed" },
        { step: "Implement", status: "pending" },
      ],
    });

    expect(tasks?.map((task) => task.text)).toEqual(["Investigate", "Implement"]);
  });
});

describe("buildTaskProgress", () => {
  it("aggregates counts and preserves order", () => {
    const entries = extractTaskEntriesFromToolCall("TodoWrite", {
      todos: [
        { content: "a", status: "completed" },
        { content: "b", status: "in_progress" },
        { content: "c", status: "pending" },
        { content: "d", status: "pending" },
      ],
    });

    const progress = buildTaskProgress(entries ?? [], "2026-06-28T00:00:00.000Z");

    expect(progress).toEqual({
      items: [
        { text: "a", status: "completed" },
        { text: "b", status: "in_progress" },
        { text: "c", status: "pending" },
        { text: "d", status: "pending" },
      ],
      pending: 2,
      inProgress: 1,
      completed: 1,
      total: 4,
      updatedAt: "2026-06-28T00:00:00.000Z",
    });
  });
});
