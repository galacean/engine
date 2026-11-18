import { compileProjectGlob } from "./project-glob";
import type { ProjectFileProvider } from "./virtual-project-files";
import { openProjectFile } from "./project-file-view";

import {
  SEARCH_LIMITS,
  type ProjectFileSearchInput,
  type ProjectFileSearchMatch,
  type ProjectFileSearchResult
} from "./project-search-contract";
import { ProjectRegexClient, ProjectRegexWorkerError } from "./project-regex-client";
export {
  SEARCH_LIMITS,
  type ProjectFileSearchInput,
  type ProjectFileSearchMatch,
  type ProjectFileSearchResult
} from "./project-search-contract";

export function validateSearchInput(value: unknown): ProjectFileSearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid file search arguments");
  const args = value as Record<string, unknown>;
  if (
    Object.keys(args).some((key) => !["path", "query", "glob", "caseSensitive", "limit", "mode"].includes(key)) ||
    typeof args.path !== "string" ||
    args.path.length > 240 ||
    (args.path !== "" &&
      (args.path.includes("\\") || args.path.split("/").some((part) => !part || part === "." || part === ".."))) ||
    typeof args.query !== "string" ||
    !args.query.length ||
    args.query.length > SEARCH_LIMITS.queryChars ||
    /[\r\n\0]/.test(args.query) ||
    (args.glob != null &&
      (typeof args.glob !== "string" ||
        !args.glob.length ||
        args.glob.length > SEARCH_LIMITS.globChars ||
        args.glob.includes("\\") ||
        args.glob.split("/").some((part) => !part || part === "." || part === ".."))) ||
    (args.mode !== undefined && args.mode !== "literal" && args.mode !== "regex") ||
    (args.caseSensitive !== undefined && typeof args.caseSensitive !== "boolean") ||
    (args.limit !== undefined &&
      (typeof args.limit !== "number" ||
        !Number.isInteger(args.limit) ||
        args.limit < 1 ||
        args.limit > SEARCH_LIMITS.matches))
  ) {
    throw new Error("Invalid file search arguments");
  }
  return args as ProjectFileSearchInput;
}

/** Uses the same canonical, operation-scoped file view as file reads.
 * Each result excerpt owns its characters, so a saved Tool Result cannot pin a large source string.
 * Search observes live provider content per file, not a cross-file authoring snapshot.
 */
export async function searchProjectFiles(
  providers: readonly ProjectFileProvider[],
  raw: ProjectFileSearchInput,
  callerSignal?: AbortSignal,
  includePath: (path: string) => boolean = () => true
): Promise<ProjectFileSearchResult> {
  const deadline = new AbortController();
  const timeoutReason = new Error("Search time budget exhausted");
  const timer = setTimeout(() => deadline.abort(timeoutReason), SEARCH_LIMITS.wallTimeMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
  let regex: ProjectRegexClient | undefined;
  try {
    const input = validateSearchInput(raw),
      matches: ProjectFileSearchMatch[] = [];
    const errors: ProjectFileSearchResult["errors"] = [];
    const matchesGlob = input.glob ? compileProjectGlob(input.glob) : () => true,
      limit = input.limit ?? 20;
    // Escaping makes this a fixed-string matcher. /i preserves UTF-16 offsets (unlike lowercasing whole files).
    const insensitive =
      input.caseSensitive === false ? new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : undefined;
    const find = (text: string) => (insensitive ? text.search(insensitive) : text.indexOf(input.query));
    const encoder = new TextEncoder();
    const started = performance.now();
    let contentWaitMs = 0;
    // Waiting on a provider must not consume the traversal/scanning budget.
    // The independent wall deadline still bounds stalled network/providers.
    const waitForContent = async <T>(operation: () => Promise<T>): Promise<T> => {
      const before = performance.now();
      try {
        return await operation();
      } finally {
        contentWaitMs += performance.now() - before;
      }
    };
    async function* contentChunks(chunks: AsyncIterable<string>) {
      const iterator = chunks[Symbol.asyncIterator]();
      let done = false;
      try {
        for (;;) {
          const next = await waitForContent(() => iterator.next());
          if (next.done) {
            done = true;
            return;
          }
          yield next.value;
        }
      } finally {
        if (!done) await iterator.return?.();
      }
    }
    if (input.mode === "regex") {
      regex = new ProjectRegexClient(signal, () => deadline.abort(timeoutReason));
      try {
        // Module loading has the wall deadline; compilation has its own bounded request.
        await waitForContent(() => regex!.initialize(input.query, input.caseSensitive !== false));
      } catch (error) {
        callerSignal?.throwIfAborted();
        if (!deadline.signal.aborted) throw error;
        return {
          matches: [],
          complete: false,
          stopReason: "time_budget",
          unavailableFiles: 0,
          errors: [],
          binaryFiles: 0,
          searchedFiles: 0,
          visitedPaths: 0,
          scannedChars: 0
        };
      }
    }
    let sliceStarted = started,
      visitedPaths = 0,
      searchedFiles = 0,
      scannedChars = 0;
    let unavailableFiles = 0,
      binaryFiles = 0,
      resultBytes = 1024;
    let stopReason: ProjectFileSearchResult["stopReason"] = null;
    const checkpoint = async () => {
      callerSignal?.throwIfAborted();
      const now = performance.now();
      if (deadline.signal.aborted || now - started - contentWaitMs >= SEARCH_LIMITS.durationMs) {
        stopReason = "time_budget";
        return false;
      }
      if (now - sliceStarted >= SEARCH_LIMITS.sliceMs) {
        // A task yield lets rendering and abort handlers run; a resolved Promise does not.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStarted = performance.now();
        callerSignal?.throwIfAborted();
        if (sliceStarted - started - contentWaitMs >= SEARCH_LIMITS.durationMs) {
          stopReason = "time_budget";
          return false;
        }
      }
      return true;
    };
    const addMatch = (match: ProjectFileSearchMatch): boolean => {
      const bytes = encoder.encode(JSON.stringify(match)).byteLength + 1;
      if (resultBytes + bytes > SEARCH_LIMITS.resultBytes) {
        stopReason = "output_budget";
        return false;
      }
      resultBytes += bytes;
      matches.push(match);
      if (matches.length >= limit) {
        stopReason = "match_limit";
        return false;
      }
      return true;
    };
    scan: for (const provider of providers) {
      for (const path of provider.paths()) {
        if (!(await checkpoint())) break scan;
        if (visitedPaths >= SEARCH_LIMITS.paths) {
          stopReason = "path_budget";
          break scan;
        }
        visitedPaths++;
        if (input.path && path !== input.path && !path.startsWith(`${input.path}/`)) continue;
        if (!matchesGlob(path) || !includePath(path)) {
          if (path === input.path) break scan;
          continue;
        }
        const matchStart = matches.length,
          bytesStart = resultBytes;
        try {
          const source = await waitForContent(() => openProjectFile(provider, path, signal));
          if (source.kind === "binary") {
            binaryFiles++;
            if (path === input.path) break scan;
            continue;
          }
          if (regex) {
            let first = true;
            const push = async (text: string, end: boolean) => {
              const hits = await regex!.push(
                text,
                first,
                end,
                limit - matches.length,
                SEARCH_LIMITS.durationMs - (performance.now() - started - contentWaitMs)
              );
              first = false;
              for (const hit of hits) if (!addMatch({ path, ...hit })) return false;
              return true;
            };
            for await (const incoming of contentChunks(source.chunks)) {
              if (!(await checkpoint())) break scan;
              const size = Math.min(incoming.length, SEARCH_LIMITS.scanChars - scannedChars);
              if (!size && incoming.length) {
                stopReason = "scan_budget";
                break scan;
              }
              scannedChars += size;
              if (!(await push(incoming.slice(0, size), false))) break scan;
              if (size < incoming.length) {
                stopReason = "scan_budget";
                break scan;
              }
            }
            if (!(await checkpoint()) || !(await push("", true))) break scan;
            searchedFiles++;
            if (path === input.path) break scan;
            continue;
          }
          let line = 1,
            column = 1,
            suffix = "",
            matchedLine = false;
          for await (const incoming of contentChunks(source.chunks)) {
            if (!(await checkpoint())) break scan;
            for (let offset = 0; offset < incoming.length; ) {
              if (!(await checkpoint())) break scan;
              const size = Math.min(
                SEARCH_LIMITS.blockChars,
                incoming.length - offset,
                SEARCH_LIMITS.scanChars - scannedChars
              );
              if (!size) {
                stopReason = "scan_budget";
                break scan;
              }
              // Never scan/split/lowercase an entire file, including a single enormous line.
              const block = incoming.slice(offset, offset + size);
              scannedChars += size;
              const candidate = suffix + block;
              if (find(candidate) === -1) {
                // Like a literal prefilter: a non-matching block needs only line counting, not per-line strings/matchers.
                let lastNewline = -1,
                  newline = block.indexOf("\n"),
                  newlines = 0;
                while (newline !== -1) {
                  line++;
                  lastNewline = newline;
                  if (++newlines % 256 === 0 && !(await checkpoint())) break scan;
                  newline = block.indexOf("\n", newline + 1);
                }
                if (lastNewline === -1) column += block.length;
                else {
                  column = block.length - lastNewline;
                  matchedLine = false;
                }
                suffix =
                  input.query.length === 1
                    ? ""
                    : candidate.slice(
                        Math.max(
                          lastNewline === -1 ? 0 : suffix.length + lastNewline + 1,
                          candidate.length - input.query.length + 1
                        )
                      );
                offset += size;
                continue;
              }
              let start = 0,
                segments = 0;
              while (start < block.length) {
                if (++segments % 64 === 0 && !(await checkpoint())) break scan;
                const newline = block.indexOf("\n", start),
                  end = newline === -1 ? block.length : newline;
                const part = block.slice(start, end);
                if (!matchedLine) {
                  const window = suffix + part;
                  const hit = find(window);
                  if (hit !== -1) {
                    const excerptStart = Math.max(0, hit - 80),
                      excerptEnd = Math.min(window.length, excerptStart + SEARCH_LIMITS.excerptChars);
                    // Explicit bounded copy: JS engines may otherwise retain the full file through sliced strings.
                    let text = "";
                    for (let i = excerptStart; i < excerptEnd; i++) text += window[i];
                    const match = {
                      path,
                      line,
                      column: column - suffix.length + hit,
                      text,
                      textColumn: column - suffix.length + excerptStart
                    };
                    if (!addMatch(match)) break scan;
                    matchedLine = true;
                  }
                  suffix = window.slice(-Math.min(input.query.length - 1, window.length));
                  if (input.query.length === 1) suffix = "";
                }
                column += part.length;
                if (newline !== -1) {
                  line++;
                  column = 1;
                  suffix = "";
                  matchedLine = false;
                }
                start = end + 1;
              }
              offset += size;
            }
          }
          searchedFiles++;
          // A validated VFS path cannot be both a file and a directory, or have two owners.
          if (path === input.path) break scan;
        } catch (error) {
          callerSignal?.throwIfAborted();
          if (deadline.signal.aborted) {
            stopReason = "time_budget";
            break scan;
          }
          if (error instanceof ProjectRegexWorkerError) throw error;
          // A failed/stale stream cannot contribute partial hits from mixed versions.
          matches.length = matchStart;
          resultBytes = bytesStart;
          unavailableFiles++;
          if (errors.length < 4) {
            const detail = { path, message: String(error instanceof Error ? error.message : error).slice(0, 160) };
            const bytes = encoder.encode(JSON.stringify(detail)).byteLength + 1;
            if (resultBytes + bytes <= SEARCH_LIMITS.resultBytes) {
              errors.push(detail);
              resultBytes += bytes;
            }
          }
          if (path === input.path) break scan;
        }
      }
    }
    callerSignal?.throwIfAborted();
    if (deadline.signal.aborted) stopReason = "time_budget";
    return {
      matches,
      complete: stopReason === null && unavailableFiles === 0,
      stopReason,
      unavailableFiles,
      errors,
      binaryFiles,
      searchedFiles,
      visitedPaths,
      scannedChars
    };
  } finally {
    regex?.dispose();
    clearTimeout(timer);
    deadline.abort();
  }
}
