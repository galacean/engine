import { completeAgentEdit } from "./agent-edit-completion";
import { activateCommittedEdit } from "./agent-edit-activation";
import * as z from "zod";
import {
  assertProjectPath,
  type VirtualProjectFiles
} from "@galacean/engine-project/project-files/virtual-project-files";
import { compileProjectGlob } from "@galacean/engine-project/project-files/project-glob";
import { readAgentFile } from "./agent-file-read";
import { toAgentValue } from "./agent-values";
import type {
  AgentApplicationDefinition,
  AgentExecutionReceipt,
  AgentFileToolName,
  AgentModelToolDefinition,
  AgentToolResult
} from "./agent-types";

const filePath = z
  .string()
  .min(1)
  .max(240)
  .transform((value) => {
    assertProjectPath(value);
    return value;
  });
const rootPath = z
  .string()
  .max(240)
  .transform((value) => {
    if (value && value !== ".") assertProjectPath(value);
    return value === "." ? "" : value;
  });
const pattern = z.string().min(1).max(240);
export const nativeFileSchemas = {
  read: z.strictObject({
    file_path: filePath,
    offset: z.number().int().positive().nullish(),
    column: z.number().int().positive().nullish(),
    limit: z.number().int().min(1).max(2000).nullish()
  }),
  write: z.strictObject({ file_path: filePath, content: z.string() }),
  edit: z.strictObject({
    file_path: filePath,
    old_string: z.string().min(1),
    new_string: z.string(),
    replace_all: z.boolean().nullish()
  }),
  delete: z.strictObject({ file_path: filePath }),
  glob: z.strictObject({ pattern, path: rootPath.nullish() }),
  grep: z.strictObject({ pattern, path: rootPath.nullish(), include: z.string().min(1).max(120).nullish() })
};
const descriptions: Record<AgentFileToolName, string> = {
  read: "Read a UTF-8 project file with line numbers. file_path is relative to the virtual project root. Host knowledge links under editor/ use project-root paths directly; do not prepend the current directory. offset is 1-based (default 1); limit defaults to 2000. Binary files return descriptors. Large results report the next line offset; page boundaries keep rows intact. Long lines return a partial line and next={offset,column}; column is a 1-based UTF-16 position. Follow next unchanged to read the remainder without losing text. Read an existing document before write/edit; a changed document must be read again.",
  write:
    "Create or completely replace a project-owned plain-text file. Provide file_path and full content. Existing files must have been read and remain unchanged. Registered assets use editor.asset in execute. editor/, execution-output/ and mounted libraries are read-only. .meta requires an existing target and JSON summary/optional usage. Each successful call commits independently and participates in save/undo.",
  edit: "Replace literal old_string with new_string in a project document. Defaults to one unique match; replace_all=true replaces every non-overlapping match. Empty new_string deletes matched text. Read the file first; stale or ambiguous edits fail without changing it. Same file boundaries and independent commit as write.",
  delete:
    "Delete one project-owned ordinary file and its metadata. Missing files fail. Does not recursively delete directories, registered assets, mounted libraries or editor knowledge. Registered assets use editor.asset.delete in execute. Commits independently and participates in save/undo.",
  glob: 'Find files, not directories, by glob pattern. path defaults to the project root ("."). Supports *, ?, **, character classes and {a,b}; a pattern without / matches basenames at any depth. Includes hidden files except VCS metadata. Virtual files have no mtime; results use stable path order. Returns up to 100 paths and a read locator for overflow.',
  grep: 'Search file contents with a regular expression. path defaults to the project root (".") and may name a file or directory. include is one positive glob (e.g. *.ts or *.{js,ts}), not a comma-separated list or negation. Uses RE2 syntax (no lookaround/backreferences) in this browser VFS. Returns matching lines grouped by file; use read for context. Partial searches explicitly report limits/errors; no matches in a partial search does not prove absence.'
};
export const isNativeFileTool = (name: string): name is AgentFileToolName => Object.hasOwn(nativeFileSchemas, name);
export const isParallelFileTool = (name: AgentFileToolName) => name === "read" || name === "glob" || name === "grep";
export function nativeFileDefinitions(): AgentModelToolDefinition[] {
  return (Object.keys(nativeFileSchemas) as AgentFileToolName[]).map((name) => {
    const parameters = z.toJSONSchema(nativeFileSchemas[name], { io: "input" });
    // ASAP accepts strict function schemas only. Nullable optional fields retain
    // their default semantics while every provider property is declared required.
    parameters.required = Object.keys(parameters.properties ?? {});
    return {
      type: "function",
      function: {
        name,
        description: descriptions[name],
        parameters,
        strict: true
      }
    };
  });
}
export type NativeFileOutcome = { content: string; result: AgentToolResult; receipt?: AgentExecutionReceipt };

export function nativeFileTraceInput(input: Record<string, unknown>) {
  try {
    return toAgentValue(
      Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
          key,
          typeof value === "string" && value.length > 4096
            ? { preview: value.slice(0, 4096), characters: value.length, truncated: true }
            : value
        ])
      )
    );
  } catch {
    return { truncated: true, message: "Arguments exceed the trace preview budget; inspect the original tool call." };
  }
}

/** Native tools adapt DSH's model contracts to the host-owned VFS and project transactions. */
export class AgentNativeFiles {
  constructor(
    private readonly files: () => VirtualProjectFiles,
    private readonly definition: () => AgentApplicationDefinition,
    private readonly observed: Map<string, string>,
    private readonly save: (content: string) => string,
    private readonly timeoutMs = 60_000
  ) {}

  async execute(
    name: AgentFileToolName,
    raw: Record<string, unknown>,
    id: string,
    callerSignal: AbortSignal
  ): Promise<NativeFileOutcome> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error("File operation timed out")), this.timeoutMs);
    const signal = AbortSignal.any([callerSignal, deadline.signal]);
    let receipt: AgentExecutionReceipt | undefined;
    try {
      const input = nativeFileSchemas[name].parse(raw) as Record<string, any>;
      signal.throwIfAborted();
      if (name === "read") {
        const files = this.files();
        const { result, observedContent } = await readAgentFile(
          files,
          {
            file_path: input.file_path,
            offset: input.offset ?? 1,
            column: input.column ?? 1,
            limit: input.limit ?? 2000
          },
          signal
        );
        // Stream-only knowledge and binary descriptors need no edit observation.
        try {
          const text = files.readContent(input.file_path);
          if (observedContent !== undefined && text === observedContent)
            this.observed.set(input.file_path, observedContent);
          else this.observed.delete(input.file_path);
        } catch {
          this.observed.delete(input.file_path);
        }
        if (!("lines" in result)) return this.success(result, JSON.stringify(result));
        // Preserve the complete cursor in the model-facing text, including a
        // same-line continuation. An offset alone would repeat a long line.
        const body = result.lines.map((line) => `${line.number}: ${line.text}`).join("\n");
        const continuation = result.next
          ? `\n(Continue with read offset=${result.next.offset}${result.next.column === undefined ? "" : ` column=${result.next.column}`}.)`
          : "";
        return this.success(
          result,
          `<path>${result.path}</path>\n<type>file</type>\n<content>\n${body}${continuation}\n</content>`
        );
      }
      if (name === "glob") {
        const root = input.path ?? "";
        const snapshot = this.files().snapshot();
        if (root && snapshot.kind(root) !== "directory") throw new Error(`Not a directory: '${root}'`);
        const matches = compileProjectGlob(input.pattern);
        const paths = snapshot
          .list()
          .filter(
            (path) =>
              !/(^|\/)\.(git|hg|svn)(\/|$)/.test(path) &&
              (!root || path.startsWith(root + "/")) &&
              matches(root ? path.slice(root.length + 1) : path)
          )
          .sort();
        const content = paths.length ? paths.slice(0, 100).join("\n") : "No files found";
        return this.success({ root: root || ".", paths }, content + this.overflow(paths, 100));
      }
      if (name === "grep") {
        if (input.include) {
          compileProjectGlob(input.include);
          if (input.include.startsWith("!") || hasTopLevelComma(input.include))
            throw new Error("include must be one positive glob");
        }
        const root = input.path ?? "";
        if (root && !this.files().kind(root)) throw new Error(`Unknown search path '${root}'`);
        const include = input.include ? compileProjectGlob(input.include) : () => true;
        const result = await this.files().search(
          { path: root, query: input.pattern, mode: "regex", limit: 250 },
          signal,
          (path) =>
            !/(^|\/)\.(git|hg|svn)(\/|$)/.test(path) &&
            include(root && path.startsWith(root + "/") ? path.slice(root.length + 1) : path)
        );
        const matches = result.matches;
        let previous = "";
        const body =
          matches
            .map((match) => {
              const heading = previous === match.path ? "" : `${match.path}\n`;
              previous = match.path;
              return `${heading}  Line ${match.line}: ${match.text}`;
            })
            .join("\n") || "No matches found";
        const partial = result.complete
          ? ""
          : `\nPartial search: ${result.stopReason ?? "unavailable files"}; unavailable=${result.unavailableFiles}. ${result.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`;
        return this.success(result, body + partial);
      }
      const transaction = await this.definition().beginEdit?.(id, signal);
      if (!transaction) throw new Error("Host does not support ordinary file editing");
      let publishing = false;
      let outcome: NativeFileOutcome;
      let failure: unknown;
      try {
        if (!transaction.documents) throw new Error("Host does not support ordinary file editing");
        const path = input.file_path as string;
        const before = await transaction.documents.read(path);
        if (name !== "write" && before === undefined) throw new Error(`Unknown document '${path}'`);
        if ((name === "write" || name === "edit") && before !== undefined) {
          if (!this.observed.has(path)) throw new Error(`File has not been read: '${path}'; read it before editing`);
          if (this.observed.get(path) !== before) throw new Error(`File changed since read: '${path}'; read it again`);
        }
        let after: string | undefined;
        if (name === "delete") await transaction.documents.delete(path);
        else {
          after =
            name === "write"
              ? input.content
              : replaceText(before!, input.old_string, input.new_string, input.replace_all ?? false);
          await transaction.documents.write(path, after!);
          after = await transaction.documents.read(path);
        }
        await transaction.prepare(signal);
        signal.throwIfAborted();
        // Publication owns the edit after the last cancellation check. Activation
        // has its own bounded wait, shared with execute; neither can undo a commit.
        clearTimeout(timer);
        publishing = true;
        const committed = await transaction.commit();
        receipt = { executionId: id, status: "committed", ...committed };
        if (after === undefined) this.observed.delete(path);
        else this.observed.set(path, after);
        try {
          if (transaction.activate) await activateCommittedEdit(transaction, callerSignal, this.timeoutMs);
        } catch (error) {
          receipt = { ...receipt, runtimeErrors: [message(error)] };
        }
        const value =
          name === "edit"
            ? { path, before, after }
            : name === "delete"
              ? { path, deleted: true }
              : { path, created: before === undefined };
        const content =
          name === "delete"
            ? `Deleted file: ${path}`
            : name === "edit"
              ? `Updated file: ${path}`
              : `${before === undefined ? "Created" : "Updated"} file: ${path}`;
        outcome = this.success(value, content);
      } catch (error) {
        receipt ??= { executionId: id, status: publishing ? "publication_failed" : "aborted" };
        failure = error;
        try {
          if (!publishing) await transaction.discard();
        } catch (discardError) {
          failure = new Error(`${message(error)}; Edit discard failed: ${message(discardError)}`);
        }
        throw failure;
      } finally {
        const cleanupError = await completeAgentEdit(transaction);
        if (cleanupError) {
          if (receipt?.status === "committed") {
            receipt = { ...receipt, runtimeErrors: [...(receipt.runtimeErrors ?? []), cleanupError] };
          } else {
            throw new Error(failure ? `${message(failure)}; ${cleanupError}` : cleanupError);
          }
        }
      }
      return { ...outcome, receipt, content: `${outcome.content}\n${JSON.stringify({ receipt })}` };
    } catch (error) {
      return {
        content: `Error: ${message(error)}${receipt ? `\n${JSON.stringify({ receipt })}` : ""}`,
        result: {
          ok: false,
          error: {
            code: callerSignal.aborted
              ? "CANCELLED"
              : deadline.signal.aborted
                ? "FILE_TIMEOUT"
                : error instanceof z.ZodError
                  ? "INVALID_ARGUMENTS"
                  : "FILE_OPERATION_FAILED",
            message: message(error)
          }
        },
        receipt
      };
    } finally {
      clearTimeout(timer);
    }
  }
  private success(value: unknown, content: string): NativeFileOutcome {
    try {
      return { result: { ok: true, value: toAgentValue(value) }, content };
    } catch {
      // Trace retention limits must not turn a successful file edit into a failed publication.
      try {
        const outputFile = this.save(JSON.stringify(value, null, 2));
        return {
          result: { ok: true, value: { truncated: true, outputFile } },
          content: `${content}\nFull result: ${outputFile}`
        };
      } catch (error) {
        return {
          result: { ok: true, value: { truncated: true, reason: message(error) } },
          content: `${content}\nFull result could not be retained: ${message(error)}`
        };
      }
    }
  }
  private overflow(paths: string[], limit: number): string {
    if (paths.length <= limit) return "";
    try {
      return `\n(${paths.length - limit} paths omitted; complete list: ${this.save(paths.join("\n"))}. Read with read.)`;
    } catch (error) {
      return `\n(${paths.length - limit} paths omitted; could not save complete list: ${message(error)}. Narrow the pattern.)`;
    }
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function hasTopLevelComma(pattern: string) {
  let depth = 0;
  for (const char of pattern) {
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === "," && depth === 0) return true;
  }
  return false;
}
export function replaceText(before: string, oldString: string, newString: string, replaceAll: boolean): string {
  if (!oldString) throw new Error("old_string must be a non-empty string");
  if (oldString === newString) throw new Error("old_string and new_string must differ");
  const parts = before.split(oldString);
  if (parts.length === 1) throw new Error("old_string was not found; read the file and use exact text");
  if (parts.length > 2 && !replaceAll)
    throw new Error("old_string matches more than once; provide unique context or replace_all=true");
  return parts.join(newString);
}
