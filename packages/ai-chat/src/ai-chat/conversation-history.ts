import type { AgentImageReference } from "./agent-image-store";
import type { AgentTaskFailure, AgentTaskOutcome, AgentTaskResult } from "./agent-types";

export type AgentConversationRecord = {
  /** ISO 8601 completion time for this task. */
  timestamp: string;
  visualReferences?: readonly AgentImageReference[];
  instruction: string;
  /** Supplemental requirements retained without per-input world snapshots. */
  inputs?: readonly { text: string; inputSource: string; visualReferences?: readonly AgentImageReference[] }[];
  result: AgentTaskOutcome;
};

export type ConversationHistorySnapshot = readonly AgentConversationRecord[];

export type ConversationHistoryOptions = {
  now?: () => Date;
};

const HISTORY_LIMIT = 5;

/** Message history retains ordered visual references, never image bytes or GPU resources. */
export class ConversationHistory {
  readonly #records: AgentConversationRecord[] = [];
  readonly #now: () => Date;
  #sequence = 0;
  /** Counts newly started user turns, never model/tool steps or stop/continue. */
  beginTurn(): number {
    return ++this.#sequence;
  }

  constructor(options: ConversationHistoryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  get historyRecordCount(): number {
    return this.#records.length;
  }

  commit(result: AgentTaskResult): void {
    this.#append({
      timestamp: this.#now().toISOString(),
      instruction: result.input,
      visualReferences: structuredClone(result.visualReferences),
      ...(result.inputs?.length
        ? {
            inputs: result.inputs.map(({ text, inputSource, visualReferences }) => ({
              text,
              inputSource,
              visualReferences: structuredClone(visualReferences)
            }))
          }
        : {}),
      result: structuredClone(result.result)
    });
  }

  commitFailure(failure: AgentTaskFailure): void {
    this.#append({
      timestamp: this.#now().toISOString(),
      instruction: failure.input,
      visualReferences: structuredClone(failure.visualReferences),
      ...(failure.inputs?.length
        ? {
            inputs: failure.inputs.map(({ text, inputSource, visualReferences }) => ({
              text,
              inputSource,
              visualReferences: structuredClone(visualReferences)
            }))
          }
        : {}),
      result: structuredClone(failure.result)
    });
  }

  reset(): void {
    this.#records.length = 0;
  }

  snapshot(): ConversationHistorySnapshot {
    return structuredClone(this.#records);
  }

  #append(record: AgentConversationRecord): void {
    this.#records.push(record);
    this.#records.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    while (this.#records.length > HISTORY_LIMIT) this.#records.pop();
  }
}

export const EMPTY_CONVERSATION_HISTORY: ConversationHistorySnapshot = Object.freeze([]);
