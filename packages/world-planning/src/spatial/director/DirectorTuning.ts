import type { PlanningSession } from "../PlanningSession";
import type { SpatialCommand } from "../SpatialDocument";
import type { DirectorReport } from "./DirectorAudit";
/** Sum of violations against the original declared bands; never changes a target to fit an outcome. */
export function reportLoss(report: DirectorReport): number {
  if (!report.walk.reached || report.status === "incomplete") return Infinity;
  let loss = 0,
    n = 0;
  for (const s of report.samples)
    for (const t of report.policy.targets)
      if (s.fraction >= t.start && s.fraction <= t.end) {
        const value = s.measurement[t.role];
        loss += Math.max(0, t.min - value, value - t.max);
        n++;
      }
  return n ? loss / n : Infinity;
}
/** Offline bounded candidate study using ordinary component transactions and independent remeasurement.
 * Rejected or worse candidates restore the accepted document. Caller owns render/report invalidation.
 */
export async function tuneDirector(
  session: PlanningSession,
  entity: string,
  audit: () => Promise<DirectorReport>,
  signal?: AbortSignal
) {
  const inspection = session.inspect(entity),
    solid = inspection.components.find((c) => c.type === "solid");
  if (!solid) throw new Error("请选择具有实体尺寸参数的独立岩石或树木");
  const original = await audit(),
    initialLoss = reportLoss(original),
    attempts: { commands: SpatialCommand[]; accepted: boolean; loss: number | null; reason: string }[] = [];
  if (original.status === "pass") return { before: original, after: original, attempts, improved: false };
  let best = original,
    bestLoss = initialLoss,
    bestHeight = Number(solid.values.height),
    currentHeight = bestHeight;
  // These are bounded geometric candidates, not a magic conversion from screen ratio to metres.
  const candidates = [0.5, 1.5, 2, 3].map((s) => Math.min(80, Math.max(1, Number(solid.values.height) * s)));
  for (const height of [...new Set(candidates)]) {
    if (signal?.aborted) break;
    const commands: SpatialCommand[] = [{ op: "set", entity, component: "solid", values: { height } }];
    const receipt = await session.dispatch(commands, session.document.revision);
    if (receipt.status !== "accepted") {
      attempts.push({ commands, accepted: false, loss: null, reason: receipt.message ?? "物理约束拒绝" });
      continue;
    }
    try {
      const report = await audit(),
        loss = reportLoss(report);
      attempts.push({ commands, accepted: true, loss: Number.isFinite(loss) ? loss : null, reason: report.status });
      if (loss < bestLoss) {
        best = report;
        bestLoss = loss;
        bestHeight = height;
        currentHeight = height;
      } else {
        await session.undo();
        currentHeight = bestHeight;
      }
      if (best.status === "pass") break;
    } catch (error) {
      await session.undo();
      throw error;
    }
  }
  // Each rejected comparison undoes only its own transaction; the best authored candidate stays published.
  const after = await audit();
  return { before: original, after, attempts, improved: reportLoss(after) < initialLoss, height: currentHeight };
}
