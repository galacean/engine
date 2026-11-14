import type { SearchInput, DescriptionsInput } from "./contracts";

export type RetrievalRequest =
  | {
      id: number;
      operation: "search";
      input: SearchInput;
    }
  | { id: number; operation: "descriptions"; input: DescriptionsInput }
  | { id: number; operation: "text"; input: { path: string; maxBytes?: number } }
  | { id: number; operation: "resolve" | "resources"; input: { path: string } };
export type WorkerRequest = RetrievalRequest | { id: number; operation: "open"; input: { manifestUrl: string } };
export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
