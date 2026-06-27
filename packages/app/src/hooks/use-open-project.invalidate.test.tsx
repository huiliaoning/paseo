/**
 * @vitest-environment jsdom
 */
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { projectsQueryKey } from "@/hooks/use-projects";

const openProject = vi.hoisted(() => ({
  openProjectDirectly: vi.fn(),
}));

// Isolate the hook from the daemon/session plumbing: the only behaviour under
// test is that a successful open invalidates the projects query (and a failed
// one does not).
vi.mock("@/hooks/open-project", () => openProject);

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({ addProject: vi.fn() }),
  useHostRuntimeIsConnected: () => true,
}));

vi.mock("@/stores/session-store", () => ({
  // The hook reads canAddProject and two setters off the store via selectors;
  // none of them matter here because openProjectDirectly is mocked.
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      sessions: {},
      addEmptyProject: vi.fn(),
      setHasHydratedWorkspaces: vi.fn(),
    }),
}));

import { useOpenProject } from "@/hooks/use-open-project";

function renderOpenProject() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useOpenProject("server-1"), { wrapper });
  return { open: result.current, invalidateSpy };
}

describe("useOpenProject query invalidation", () => {
  it("invalidates the projects query when the open succeeds", async () => {
    openProject.openProjectDirectly.mockResolvedValueOnce({ ok: true });
    const { open, invalidateSpy } = renderOpenProject();

    await open("/repo/project");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectsQueryKey });
  });

  it("does not invalidate when the open fails", async () => {
    openProject.openProjectDirectly.mockResolvedValueOnce({
      ok: false,
      errorCode: null,
      error: "boom",
    });
    const { open, invalidateSpy } = renderOpenProject();

    await open("/repo/project");

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
