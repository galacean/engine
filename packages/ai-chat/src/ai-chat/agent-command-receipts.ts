import type { AgentCommandIdentity, AgentCommandReceipt, AgentToolResult } from "./agent-types";

export const MAX_COMMAND_RECEIPT_BYTES = 12 * 1024;
// Reserve the largest allowed record before invoking the host, including late identity/error fields.
const RECORD_RESERVATION_BYTES = 1536;
const encoder = new TextEncoder();
type MutableReceipt = { -readonly [K in keyof AgentCommandReceipt]: AgentCommandReceipt[K] };

/** Full arguments/results belong to Trace; this ledger retains every admitted write's bounded facts. */
export class AgentCommandLedger {
  readonly commands: MutableReceipt[] = [];
  blocked = false;
  private readonly pending = new Set<MutableReceipt>();

  start(tool: string, identity: AgentCommandIdentity): MutableReceipt | undefined {
    const facts = compactIdentity(identity);
    const name = boundedString(tool, 128);
    const reserved =
      encoder.encode(JSON.stringify(this.commands)).length +
      this.pending.size * RECORD_RESERVATION_BYTES +
      RECORD_RESERVATION_BYTES;
    if (reserved > MAX_COMMAND_RECEIPT_BYTES) return;
    const record: MutableReceipt = { call: this.commands.length + 1, tool: name, ...facts, status: "unknown" };
    this.commands.push(record);
    this.pending.add(record);
    return record;
  }

  settle(record: MutableReceipt, result: AgentToolResult, identity: AgentCommandIdentity) {
    // Validate before changing status: a broken adapter must not hide a possibly committed write.
    const facts = compactIdentity(identity);
    const errorCode = result.ok ? undefined : boundedString(result.error.code, 64);
    Object.assign(record, facts);
    if (!result.ok && result.error.executed && result.error.outcomeKnown !== true) {
      record.errorCode = errorCode;
      this.unknown(record);
      return;
    }
    Object.assign(record, { status: "settled", ok: result.ok, ...(errorCode ? { errorCode } : {}) });
    this.pending.delete(record);
  }

  unknown(record: MutableReceipt) {
    record.status = "unknown";
    this.blocked = true;
    this.pending.delete(record);
  }
}

function boundedString(value: string, bytes: number): string {
  if (typeof value !== "string" || encoder.encode(value).length > bytes || /[\u0000-\u001f]/.test(value))
    throw new Error("Command receipt identity exceeds its bounded contract");
  return value;
}

function compactIdentity(identity: AgentCommandIdentity): AgentCommandIdentity {
  const facts: { commandId?: string; scopeId?: string; revision?: number; replayed?: boolean } = {};
  for (const key of ["commandId", "scopeId"] as const)
    if (identity[key] !== undefined) facts[key] = boundedString(identity[key]!, 128);
  if (identity.revision !== undefined) {
    if (!Number.isSafeInteger(identity.revision) || identity.revision < 0) throw new Error("Invalid command revision");
    facts.revision = identity.revision;
  }
  if (identity.replayed !== undefined) {
    if (typeof identity.replayed !== "boolean") throw new Error("Invalid command replay flag");
    facts.replayed = identity.replayed;
  }
  return facts;
}
