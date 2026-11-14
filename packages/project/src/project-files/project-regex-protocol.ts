import type { ProjectFileSearchMatch } from "./project-search-contract";

export type RegexHit = Omit<ProjectFileSearchMatch, "path">;
export type RegexRequest =
  | { type: "compile"; query: string; caseSensitive: boolean }
  | { type: "chunk"; text: string; first: boolean; end: boolean; limit: number };
export type RegexReply = { type: "ready" } | { type: "result"; hits: RegexHit[] } | { type: "error"; message: string };
