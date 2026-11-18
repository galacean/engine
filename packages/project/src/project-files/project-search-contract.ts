export const SEARCH_LIMITS = Object.freeze({
  queryChars: 240,
  regexProgramSize: 8192,
  globChars: 120,
  matches: 250,
  resultBytes: 16 * 1024,
  scanChars: 8 * 1024 * 1024,
  paths: 20_000,
  durationMs: 250,
  wallTimeMs: 5000,
  sliceMs: 2,
  blockChars: 16 * 1024,
  excerptChars: 400
});

export type ProjectFileSearchInput = {
  path: string;
  query: string;
  glob?: string | null;
  caseSensitive?: boolean;
  mode?: "literal" | "regex";
  limit?: number;
};
export type ProjectFileSearchMatch = { path: string; line: number; column: number; text: string; textColumn: number };
export type ProjectFileSearchResult = {
  matches: ProjectFileSearchMatch[];
  complete: boolean;
  stopReason: "match_limit" | "output_budget" | "scan_budget" | "path_budget" | "time_budget" | null;
  unavailableFiles: number;
  errors: { path: string; message: string }[];
  binaryFiles: number;
  searchedFiles: number;
  visitedPaths: number;
  scannedChars: number;
};
