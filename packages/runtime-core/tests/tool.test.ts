import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ToolRuntime } from "../src/Tool/tool";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "runtime-core-tool-"));
  workspaces.push(workspace);
  return workspace;
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

describe("ToolRuntime", () => {
  it("enforces workspace path guards for file_editor", () => {
    const runtime = new ToolRuntime();
    const workspace = createWorkspace();

    expect(() =>
      runtime.execute(
        "file_editor",
        { command: "write", path: "../escape.txt", content: "x" },
        workspace,
      ),
    ).toThrowError("Path must stay inside workspace.");
  });

  it("normalizes terminal output", () => {
    const runtime = new ToolRuntime();
    const workspace = createWorkspace();

    const result = runtime.execute(
      "terminal",
      { command: `node -e "process.stdout.write('hello')"` },
      workspace,
    );

    expect(result).toContain("exit_code=0");
    expect(result).toContain("stdout=hello");
  });

  it("tracks in-memory tasks", () => {
    const runtime = new ToolRuntime();
    const workspace = createWorkspace();

    expect(runtime.execute("task_tracker", { command: "add", title: "first" }, workspace)).toBe(
      "added task #1",
    );
    expect(runtime.execute("task_tracker", { command: "list" }, workspace)).toBe("1. first");
  });
});
