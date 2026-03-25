import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolDefinition = ToolSchema;

export type SecurityRisk = "low" | "medium" | "high" | "unknown";

export type PlannedAction = {
  tool_name: string;
  arguments: Record<string, unknown>;
  summary: string;
  security_risk: SecurityRisk;
};

export type ToolSpec = ToolDefinition & {
  execute: (arguments_: Record<string, unknown>, working_dir: string) => string;
};

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(limit - 3, 0))}...`;
}

export function resolveWorkspacePath(workspaceDir: string, relativePath: string): string {
  const workspace = resolve(workspaceDir);
  const target = resolve(workspace, relativePath);
  if (target === workspace || target.startsWith(`${workspace}/`)) {
    return target;
  }
  throw new Error("Path must stay inside workspace.");
}

export class ToolRuntime {
  private readonly tasks: string[];
  private readonly tools_map: Record<string, ToolSpec>;

  constructor(initialTasks: string[] = []) {
    this.tasks = [...initialTasks];
    this.tools_map = {
      terminal: {
        name: "terminal",
        description: "Run shell command in workspace",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            summary: { type: "string" },
            security_risk: {
              type: "string",
              enum: ["low", "medium", "high", "unknown"],
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
        execute: (arguments_, working_dir) => this.execute_terminal(arguments_, working_dir),
      },
      file_editor: {
        name: "file_editor",
        description: "Write/view/delete files in workspace",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", enum: ["write", "view", "delete"] },
            path: { type: "string" },
            content: { type: "string" },
            summary: { type: "string" },
            security_risk: {
              type: "string",
              enum: ["low", "medium", "high", "unknown"],
            },
          },
          required: ["command", "path"],
          additionalProperties: false,
        },
        execute: (arguments_, working_dir) => this.execute_file_editor(arguments_, working_dir),
      },
      task_tracker: {
        name: "task_tracker",
        description: "Track short in-memory todo list",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", enum: ["add", "list"] },
            title: { type: "string" },
            summary: { type: "string" },
            security_risk: {
              type: "string",
              enum: ["low", "medium", "high", "unknown"],
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
        execute: (arguments_, working_dir) => this.execute_task_tracker(arguments_, working_dir),
      },
    };
  }

  has_tool(tool_name: string): boolean {
    return tool_name in this.tools_map;
  }

  get_tool_definitions(): ToolDefinition[] {
    return Object.values(this.tools_map).map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  get_tool_definition_map(): Record<string, ToolDefinition> {
    return Object.fromEntries(this.get_tool_definitions().map((tool) => [tool.name, tool]));
  }

  get_llm_tools(): ToolSchema[] {
    return this.get_tool_definitions();
  }

  execute(tool_name: string, arguments_: Record<string, unknown>, working_dir: string): string {
    const spec = this.tools_map[tool_name];
    if (!spec) {
      throw new Error(`Tool '${tool_name}' is not registered.`);
    }
    return spec.execute(arguments_, working_dir);
  }

  private execute_terminal(arguments_: Record<string, unknown>, working_dir: string): string {
    const command = typeof arguments_.command === "string" ? arguments_.command.trim() : "";
    if (!command) {
      throw new Error("terminal.command must be a non-empty string");
    }

    try {
      const stdout = execSync(command, {
        cwd: working_dir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      });
      return `exit_code=0 | stdout=${truncate(stdout.trim(), 500)}`;
    } catch (error) {
      const message =
        error instanceof Error && "stderr" in error
          ? String((error as { stderr?: Buffer | string }).stderr ?? "").trim()
          : String(error);
      const stdout =
        error instanceof Error && "stdout" in error
          ? String((error as { stdout?: Buffer | string }).stdout ?? "").trim()
          : "";
      const code =
        typeof (error as { status?: number }).status === "number"
          ? (error as { status?: number }).status
          : 1;

      const parts = [`exit_code=${code}`];
      if (stdout) {
        parts.push(`stdout=${truncate(stdout, 500)}`);
      }
      if (message) {
        parts.push(`stderr=${truncate(message, 500)}`);
      }
      return parts.join(" | ");
    }
  }

  private execute_file_editor(arguments_: Record<string, unknown>, working_dir: string): string {
    const command = typeof arguments_.command === "string" ? arguments_.command : "";
    const relativePath = typeof arguments_.path === "string" ? arguments_.path.trim() : "";
    if (!relativePath) {
      throw new Error("file_editor.path must be a non-empty string");
    }

    const filePath = resolveWorkspacePath(working_dir, relativePath);

    if (command === "write") {
      const content = typeof arguments_.content === "string" ? arguments_.content : "";
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, "utf-8");
      return `wrote ${relativePath} (${content.length} chars)`;
    }

    if (command === "view") {
      return truncate(readFileSync(filePath, "utf-8"), 500);
    }

    if (command === "delete") {
      unlinkSync(filePath);
      return `deleted ${relativePath}`;
    }

    throw new Error(`Unsupported file_editor command: ${command}`);
  }

  private execute_task_tracker(arguments_: Record<string, unknown>, _working_dir: string): string {
    const command = typeof arguments_.command === "string" ? arguments_.command : "";
    if (command === "add") {
      const title = typeof arguments_.title === "string" ? arguments_.title.trim() : "";
      if (!title) {
        throw new Error("task_tracker.title must be a non-empty string");
      }
      this.tasks.push(title);
      return `added task #${this.tasks.length}`;
    }

    if (command === "list") {
      if (this.tasks.length === 0) {
        return "no tasks";
      }
      return this.tasks.map((task, index) => `${index + 1}. ${task}`).join(", ");
    }

    throw new Error(`Unsupported task_tracker command: ${command}`);
  }
}
