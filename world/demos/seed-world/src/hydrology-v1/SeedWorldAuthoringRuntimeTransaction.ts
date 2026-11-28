export interface SeedWorldAuthoringRuntimeTransactionStepV1 {
  readonly label: string;
  /** May publish partially before throwing; rollback is therefore armed before apply starts. */
  apply(): void | Promise<void>;
  rollback(): void | Promise<void>;
}

/** The runtime can no longer be assumed to match the committed authoring state. */
export class SeedWorldAuthoringRuntimeRollbackError extends AggregateError {}

/**
 * Publishes one local Authoring transaction and unwinds every armed step in
 * reverse order if any later Runtime boundary rejects the candidate.
 */
export async function publishSeedWorldAuthoringRuntimeTransactionV1(
  steps: readonly Readonly<SeedWorldAuthoringRuntimeTransactionStepV1>[]
): Promise<() => Promise<void>> {
  const armed: Readonly<SeedWorldAuthoringRuntimeTransactionStepV1>[] = [];
  try {
    for (const step of steps) {
      armed.push(step);
      await step.apply();
    }
  } catch (cause) {
    const rollbackErrors = await rollbackSeedWorldAuthoringRuntimeStepsV1(armed);
    if (rollbackErrors.length > 0) {
      throw new SeedWorldAuthoringRuntimeRollbackError(
        [cause, ...rollbackErrors],
        "Seed World Authoring Runtime publication and rollback both failed."
      );
    }
    throw cause;
  }
  let active = true;
  return async () => {
    if (!active) return;
    active = false;
    const rollbackErrors = await rollbackSeedWorldAuthoringRuntimeStepsV1(armed);
    if (rollbackErrors.length > 0) {
      throw new SeedWorldAuthoringRuntimeRollbackError(rollbackErrors, "Seed World Authoring Runtime rollback failed.");
    }
  };
}

async function rollbackSeedWorldAuthoringRuntimeStepsV1(
  steps: readonly Readonly<SeedWorldAuthoringRuntimeTransactionStepV1>[]
): Promise<Error[]> {
  const errors: Error[] = [];
  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index]!;
    try {
      await step.rollback();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      errors.push(new Error(`Runtime rollback step '${step.label}' failed: ${error.message}`, { cause: error }));
    }
  }
  return errors;
}
