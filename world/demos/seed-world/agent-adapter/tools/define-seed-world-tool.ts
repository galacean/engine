import * as z from "zod";

import {
  AgentToolExecutionError,
  defineTool,
  type AgentTool,
  type AgentToolExecutionContext
} from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { SeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";

type SeedWorldToolImplementation<InputSchema extends z.ZodType> = {
  execute(
    input: z.output<InputSchema>,
    context: AgentToolExecutionContext
  ): Promise<unknown> | unknown;
};

/**
 * Binds a runtime implementation to the executable Zod contract. The public
 * declaration is generated from the same contract registry.
 */
export function defineSeedWorldTool<
  Name extends string,
  InputSchema extends z.ZodType,
  OutputSchema extends z.ZodType
>(
  contract: SeedWorldApiContract<Name, InputSchema, OutputSchema>,
  implementation: SeedWorldToolImplementation<InputSchema>
): AgentTool {
  return defineTool({
    name: contract.name,
    effect: contract.effect ?? "edit",
    input: contract.input,
    output: contract.output,
    execute: async (input, context) => {
      try {
        return stripInternalRevisionFields(await implementation.execute(input, context));
      } catch (error) {
        if (!(error instanceof AgentToolExecutionError)) throw error;
        throw new AgentToolExecutionError({
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          executed: error.executed,
          details: stripInternalRevisionFields(error.details),
          stack: error.stack
        });
      }
    }
  });
}

/** Runtime revisions remain internal optimistic-concurrency state and never enter the Agent contract. */
function stripInternalRevisionFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalRevisionFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/revision$/i.test(key))
      .map(([key, entry]) => [key, stripInternalRevisionFields(entry)])
  );
}
