import type { EditTransaction } from "@galacean/engine-project/edit-transaction";

/** Completion releases preparation resources without rolling back accepted authoring. */
export async function completeAgentEdit(transaction?: EditTransaction): Promise<string | undefined> {
  try {
    await transaction?.complete?.();
  } catch (error) {
    return `Edit resource cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
