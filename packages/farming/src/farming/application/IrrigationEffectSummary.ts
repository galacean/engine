import type { CommandResult, FarmChange } from "../domain/FarmCommands";

export interface IrrigationEffectSummary {
  readonly scope: "command-receipt";
  readonly revision: number;
  /** Immediate irrigation only. distributed is overflow at application, not later soil transport. */
  readonly immediateIrrigation: readonly Extract<FarmChange, { kind: "soil-irrigated" }>[];
  /** Clock settlements included in this receipt; not later observations. */
  readonly simulationSettlements: readonly Extract<FarmChange, { kind: "simulation-advanced" }>[];
  readonly laterSoilTransport: "not-observed";
}

/** A projection of committed evidence, not a new simulation or persisted receipt format. */
export function irrigationEffectSummary(receipt: CommandResult): IrrigationEffectSummary {
  return {
    scope: "command-receipt",
    revision: receipt.revision,
    immediateIrrigation: receipt.changes.filter(
      (c): c is Extract<FarmChange, { kind: "soil-irrigated" }> => c.kind === "soil-irrigated"
    ),
    simulationSettlements: receipt.changes.filter(
      (c): c is Extract<FarmChange, { kind: "simulation-advanced" }> => c.kind === "simulation-advanced"
    ),
    laterSoilTransport: "not-observed"
  };
}
