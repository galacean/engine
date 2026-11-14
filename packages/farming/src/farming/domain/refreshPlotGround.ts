import { refreshWaterGround } from "./fields/SoilWaterField";
import { freezeSnapshot, type FarmSnapshot } from "./FarmState";
import type { FarmChange } from "./FarmCommands";
import type { FarmingGroundInspectionCache } from "./FarmingGroundInspectionCache";
import {
  boundsIntersect,
  groundState,
  inspectGround,
  plotBounds,
  type FarmingGroundView,
  type FarmingGroundChange
} from "./FarmingGround";
/** No storage or revision mutation here: the service commits these facts in its own transaction. */
export function refreshPlotGround(
  snapshot: FarmSnapshot,
  view: FarmingGroundView,
  time: number,
  change?: FarmingGroundChange,
  forceWater = false,
  inspectionCache?: FarmingGroundInspectionCache
): { snapshot: FarmSnapshot; changes: readonly FarmChange[] } {
  inspectionCache?.observe(view, snapshot.grid, change);
  inspectionCache?.retainPlots(snapshot.plots);
  const changes: FarmChange[] = [];
  const plots = snapshot.plots.map((plot) => {
    if (
      !inspectionCache &&
      ((change?.groundId && change.groundId !== plot.groundId) ||
        (change?.bounds && !boundsIntersect(plotBounds(snapshot.grid, plot), change.bounds)))
    )
      return plot;
    const inspection = inspectionCache
      ? inspectionCache.inspect(view, snapshot.grid, plot, plot.plotId)
      : inspectGround(view, snapshot.grid, plot, plot.plotId);
    const ground = groundState(inspection, time, plot.ground);
    if (
      ground.availability === plot.ground.availability &&
      ground.reason === plot.ground.reason &&
      ground.groundRevision === plot.ground.groundRevision
    )
      return plot;
    changes.push({ kind: "plot-ground-changed", plotId: plot.plotId, ground });
    return { ...plot, ground };
  });
  const water = refreshWaterGround(
    changes.length ? { ...snapshot, plots } : snapshot,
    view,
    time,
    forceWater || changes.length > 0,
    change
  );
  return {
    snapshot: changes.length || water.changes.length ? freezeSnapshot(water.snapshot) : snapshot,
    changes: [...changes, ...water.changes]
  };
}
