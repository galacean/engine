import { completeAgentEdit } from "./agent-edit-completion";
import { activateCommittedEdit } from "./agent-edit-activation";
import { AgentCommandLedger } from "./agent-command-receipts";
import { EditPreparationError } from "@galacean/engine-project/edit-transaction";
import type {
  AgentApiDeclarationModule,
  AgentCommandIdentity,
  AgentCommandReceipt,
  AgentEditTransaction,
  AgentExecutionReceipt,
  AgentScriptCall,
  AgentScriptError,
  AgentScriptResult,
  AgentScriptRuntime,
  AgentScriptToolBinding,
  AgentScriptTrace
} from "./agent-types";
import type { AgentScriptChecker } from "./agent-worker-checker";

export interface AgentOpenedEdit {
  transaction: AgentEditTransaction;
  toolBindings: readonly AgentScriptToolBinding[];
}

/** The host alone decides whether checked code may publish its edit. */
export async function executeAgentEdit(
  runtime: AgentScriptRuntime,
  checker: AgentScriptChecker,
  call: AgentScriptCall,
  declarations: readonly AgentApiDeclarationModule[],
  openEdit?: (signal: AbortSignal) => Promise<AgentOpenedEdit> | AgentOpenedEdit
): Promise<AgentScriptResult> {
  const receipt = (status: AgentExecutionReceipt["status"]): AgentExecutionReceipt => ({
    executionId: call.id,
    status
  });
  let checked: AgentScriptError | undefined;
  try {
    checked = await checker.check(call.source, declarations, call.signal);
  } catch (error) {
    checked = { code: "SCRIPT_CHECK_UNAVAILABLE", phase: "check", message: message(error) };
  }
  if (checked) return { ok: false, error: checked, receipt: receipt("rejected") };

  const ledger = new AgentCommandLedger();
  const commands = ledger.commands;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(call.signal.reason);
  if (call.signal.aborted) cancel();
  else call.signal.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Agent edit timed out"));
  }, call.timeoutMs);
  const stopDeadline = () => {
    clearTimeout(timer);
    timer = undefined;
    call.signal.removeEventListener("abort", cancel);
  };
  let transaction: AgentEditTransaction | undefined;
  let trace: AgentScriptTrace | undefined;
  let result: AgentScriptResult;
  let consoleEntries: import("./agent-types").AgentConsoleEntry[] | undefined;
  let phase: AgentScriptError["phase"] = "execution";
  let publishing = false;
  let accepting = true;
  let editFailure: AgentScriptError | undefined;
  const pending = new Set<Promise<unknown>>();
  const abortable = <T>(work: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => reject(controller.signal.reason ?? new Error("Agent edit cancelled"));
      if (controller.signal.aborted) abort();
      else controller.signal.addEventListener("abort", abort, { once: true });
      void work.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
    });
  try {
    controller.signal.throwIfAborted();
    const bindings = call.toolBindings;
    let opening: Promise<void> | undefined;
    let draftBindings = new Map<string, AgentScriptToolBinding>();
    const ensureEdit = () =>
      (opening ??= (async () => {
        if (!openEdit) return;
        const opened = await openEdit(controller.signal);
        transaction = opened.transaction;
        if (controller.signal.aborted) {
          try {
            await transaction.discard();
          } finally {
            await transaction.complete?.();
          }
          controller.signal.throwIfAborted();
        }
        draftBindings = new Map(
          opened.toolBindings
            .filter((binding) => binding.effect !== "command")
            .map((binding) => [binding.name, binding])
        );
      })());
    const toolBindings = bindings.map((binding) => ({
      ...binding,
      invoke: (input: Parameters<AgentScriptToolBinding["invoke"]>[0], _signal: AbortSignal, ordinal?: number) => {
        const work = (async () => {
          controller.signal.throwIfAborted();
          if (!accepting) throw new Error("Agent edit no longer accepts Tool calls");
          if (openEdit) await abortable(ensureEdit());
          const actual = draftBindings.get(binding.name) ?? binding;
          if (!transaction && binding.effect !== "read" && binding.effect !== "command") {
            return {
              ok: false as const,
              error: {
                code: "EDIT_TRANSACTION_UNAVAILABLE",
                message: `Editing API ${binding.name} has no draft transaction`
              }
            };
          }
          let identity: AgentCommandIdentity | null;
          let command: AgentCommandReceipt | undefined;
          try {
            identity =
              binding.effect === "command" ? (binding.describeCommand ? binding.describeCommand(input) : {}) : null;
            // Classification happens before admission. Pure reads can verify an unknown write.
            if ((identity !== null || binding.effect === undefined || binding.effect === "edit") && ledger.blocked)
              return {
                ok: false as const,
                error: {
                  code: "COMMAND_OUTCOME_UNKNOWN",
                  message: "Query the previous command receipt before another write",
                  executed: false,
                  retryable: false
                }
              };
            command = identity === null ? undefined : ledger.start(binding.name, identity);
            if (identity !== null && !command)
              return {
                ok: false as const,
                error: {
                  code: "COMMAND_RECEIPT_LIMIT",
                  message: "Command receipt budget exhausted; start a new execution",
                  executed: false
                }
              };
          } catch (error) {
            return {
              ok: false as const,
              error: { code: "COMMAND_RECEIPT_INVALID", message: message(error), executed: false }
            };
          }
          try {
            const value = await actual.invoke(input, controller.signal, ordinal);
            if (command) ledger.settle(command, value, binding.describeCommand?.(input, value) ?? identity!);
            return value;
          } catch (error) {
            // A thrown host error may follow a commit. Stop admission before generated code catches it.
            if (command) ledger.unknown(command);
            throw error;
          }
        })();
        pending.add(work);
        void work
          .then(
            (value) => {
              if (!value.ok && (binding.effect === undefined || binding.effect === "edit") && !editFailure)
                editFailure = {
                  code: value.error.code,
                  phase: "tool",
                  message: value.error.message,
                  tool: binding.name,
                  details: value.error.details
                };
            },
            (error) => {
              if ((binding.effect === undefined || binding.effect === "edit") && !editFailure)
                editFailure = {
                  code: "TOOL_EXECUTION_FAILED",
                  phase: "tool",
                  message: message(error),
                  tool: binding.name
                };
            }
          )
          .finally(() => pending.delete(work));
        return work;
      }
    }));
    result = await abortable(
      runtime.execute({
        ...call,
        signal: controller.signal,
        toolBindings,
        onTrace: (value) => {
          trace = value;
        }
      })
    );
    consoleEntries = result.console;
    accepting = false;
    await abortable(Promise.allSettled([...pending]));
    controller.signal.throwIfAborted();
    if (editFailure && result.ok) result = { ok: false, error: editFailure };
    if (commands.some((command) => command.status === "unknown"))
      result = {
        ok: false,
        error: {
          code: "COMMAND_OUTCOME_UNKNOWN",
          phase: "tool",
          retryable: false,
          message: "A command may have committed; query its receipt before attempting another write"
        }
      };
    if (result.ok) {
      phase = "prepare";
      const publication = transaction?.hasChanges() ? transaction : undefined;
      if (publication) await abortable(Promise.resolve(publication.prepare(controller.signal)));
      controller.signal.throwIfAborted();
      // There are no await points between the final cancellation check and
      // publication ownership. Cancellation after this point cannot relabel it.
      stopDeadline();
      phase = "publish";
      publishing = true;
      const published = publication ? await publication.commit() : undefined;
      if (!publication) transaction?.completeRead?.();
      result = {
        ...result,
        receipt: {
          ...receipt(publication ? "committed" : "completed"),
          ...published,
          ...(publication ? { committedAt: new Date().toISOString() } : {})
        }
      };
      if (publication?.activate) {
        try {
          await activateCommittedEdit(publication, call.signal, call.timeoutMs);
        } catch (error) {
          result = { ...result, receipt: { ...result.receipt!, runtimeErrors: [message(error)] } };
        }
      }
    } else {
      result = { ...result, receipt: receipt(commands.length ? "interrupted" : "aborted") };
    }
  } catch (error) {
    result = {
      ok: false,
      receipt: receipt(publishing ? "publication_failed" : commands.length ? "interrupted" : "aborted"),
      error: {
        code: publishing
          ? "EDIT_PUBLICATION_FAILED"
          : controller.signal.aborted
            ? timedOut
              ? "SCRIPT_TIMEOUT"
              : "SCRIPT_CANCELLED"
            : error instanceof EditPreparationError
              ? error.code
              : "EDIT_PREPARATION_FAILED",
        phase: publishing
          ? "publish"
          : controller.signal.aborted
            ? timedOut
              ? "timeout"
              : "cancelled"
            : error instanceof EditPreparationError
              ? error.phase
              : phase,
        message:
          controller.signal.aborted && !publishing
            ? timedOut
              ? `Agent edit exceeded timeoutMs=${call.timeoutMs}`
              : "Agent edit cancelled"
            : message(error),
        ...(publishing ? { retryable: false } : {})
      }
    };
  } finally {
    accepting = false;
    stopDeadline();
    controller.abort();
  }
  if (result.receipt?.status !== "committed" && transaction) {
    try {
      await transaction.discard();
    } catch (error) {
      result = {
        ok: false,
        receipt: receipt("publication_failed"),
        error: {
          code: "EDIT_DISCARD_FAILED",
          phase: "publish",
          retryable: false,
          message: `Edit cleanup failed: ${message(error)}`
        }
      };
    }
  }
  const cleanupError = await completeAgentEdit(transaction);
  if (cleanupError) {
    if (result.receipt?.status === "committed") {
      result = {
        ...result,
        receipt: { ...result.receipt, runtimeErrors: [...(result.receipt.runtimeErrors ?? []), cleanupError] }
      };
    } else {
      result = {
        ok: false,
        receipt: result.receipt,
        error: {
          code: "EDIT_CLEANUP_FAILED",
          phase: "publish",
          retryable: false,
          message: cleanupError
        }
      };
    }
  }
  result = { ...result, console: result.console ?? consoleEntries ?? trace?.result.console };
  if (commands.length) {
    result = { ...result, receipt: { ...result.receipt!, commands: structuredClone(commands) } };
    if (!result.ok && commands.some((command) => command.status === "unknown"))
      result = { ...result, error: { ...result.error, retryable: false } };
  }
  if (trace) {
    try {
      call.onTrace?.({ ...trace, result: structuredClone(result) });
    } catch {
      /* Trace observers cannot undo a committed edit. */
    }
  }
  return result;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
