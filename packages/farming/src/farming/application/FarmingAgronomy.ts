import type { FarmingService } from "./FarmingService";
import type { FarmingAgronomyEvidence } from "../domain/FarmingAgronomy";

/** Reads the same plot/crop evaluation as gameplay. Does not advance time or repair the farm. */
export function inspectFarmingAgronomy(service: FarmingService): FarmingAgronomyEvidence {
  const snapshot = service.getSnapshot();
  const plots = service.queryPlots();
  const findings: {
    plotId: string;
    kind: "ground-unavailable" | "crop-health" | "crop-growth-paused";
    reason: string;
  }[] = [];
  for (const plot of plots) {
    if (plot.ground.availability !== "available")
      findings.push({
        plotId: plot.plotId,
        kind: "ground-unavailable",
        reason: plot.ground.reason ?? plot.ground.availability
      });
    if (plot.crop?.healthStatus && plot.crop.healthStatus !== "normal")
      findings.push({ plotId: plot.plotId, kind: "crop-health", reason: plot.crop.healthStatus });
    if (plot.crop?.pausedReason)
      findings.push({ plotId: plot.plotId, kind: "crop-growth-paused", reason: plot.crop.pausedReason });
  }
  const moisture = plots.map((p) => p.soil.moistureUnits);
  return {
    revision: snapshot.revision,
    simulatedTimeMs: snapshot.simulation.simulatedTimeMs,
    checked: ["plot-ground", "crop-health", "crop-growth", "soil-values", "inventory-quantities"],
    unchecked: ["visual-appearance", "future-simulation"],
    assessment: findings.length ? "attention-needed" : "no-issues-found",
    plotCount: plots.length,
    cropCount: plots.filter((p) => p.crop).length,
    emptyPlotCount: plots.filter((p) => !p.crop).length,
    matureCropCount: plots.filter((p) => p.crop?.mature).length,
    soilMoisture: {
      unit: "volumetric-percentage-points",
      minimum: moisture.length ? Math.min(...moisture) : null,
      maximum: moisture.length ? Math.max(...moisture) : null
    },
    storedQuantity: Object.values(snapshot.inventory).reduce((sum, n) => sum + n, 0),
    pendingHarvestQuantity: snapshot.items.instances.reduce(
      (sum, item) => sum + item.contents.reduce((n, c) => n + c.quantity, 0),
      0
    ),
    findingCount: findings.length,
    findings: findings.slice(0, 32)
  };
}
