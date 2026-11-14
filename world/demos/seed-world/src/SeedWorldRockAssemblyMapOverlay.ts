import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldRockAcceptanceRequest } from "./SeedWorldRockAcceptance.ts";
import type { SeedWorldRockCompilation } from "./SeedWorldRockCompiler.ts";
import type { SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";
import { projectSeedWorldRockObbToGround } from "./SeedWorldRockObbClearance.ts";

/**
 * Draws the exact plan projection of every compiled strict OBB.
 * @param context Target map canvas context.
 * @param plan World plan supplying the 3072-metre extent.
 * @param compilation Formal rock solve retained only for stable P-number labels.
 * @param publishedRocks Final OBB list shared with the 3D runtime after acceptance adjustments.
 * @param x Map viewport origin X in CSS pixels.
 * @param y Map viewport origin Y in CSS pixels.
 * @param size Square map viewport size in CSS pixels.
 * @param showLabels Whether stable P-number identifiers are rendered.
 * @param requests Acceptance-only missing-rock points rendered as A-number markers.
 */
export function drawSeedWorldRockAssemblies(
  context: CanvasRenderingContext2D,
  plan: SeedWorldPlan,
  compilation: SeedWorldRockCompilation,
  publishedRocks: readonly SeedWorldSolvedRockObb[],
  x: number,
  y: number,
  size: number,
  showLabels: boolean,
  requests: readonly SeedWorldRockAcceptanceRequest[] = []
): void {
  context.save();
  context.lineJoin = "round";
  const formalIndexByRockId = new Map(compilation.assemblies.rocks.map((rock, index) => [rock.id, index] as const));
  publishedRocks.forEach((rock) => {
    const footprint = projectSeedWorldRockObbToGround(rock).polygon.map(([worldX, worldZ]) => ({
      x: x + (worldX / plan.sizeMetres + 0.5) * size,
      y: y + (worldZ / plan.sizeMetres + 0.5) * size
    }));
    if (footprint.length < 3) return;
    context.beginPath();
    context.moveTo(footprint[0]!.x, footprint[0]!.y);
    for (let pointIndex = 1; pointIndex < footprint.length; pointIndex++) {
      context.lineTo(footprint[pointIndex]!.x, footprint[pointIndex]!.y);
    }
    context.closePath();
    context.fillStyle = roleFill(rock);
    context.strokeStyle = roleStroke(rock);
    context.lineWidth = 1.15;
    context.fill();
    context.stroke();
    if (!showLabels) return;
    const labelX = x + (rock.obbCenter[0] / plan.sizeMetres + 0.5) * size;
    const labelY = y + (rock.obbCenter[2] / plan.sizeMetres + 0.5) * size;
    const label = rockMapLabel(rock, formalIndexByRockId);
    context.font = "700 9px ui-monospace, monospace";
    context.fillStyle = "#fff8dc";
    context.strokeStyle = "rgb(29 24 17 / 90%)";
    context.lineWidth = 2.5;
    context.strokeText(label, labelX + 4, labelY - 4);
    context.fillText(label, labelX + 4, labelY - 4);
  });
  for (const request of requests) {
    const markerX = x + (request.position[0] / plan.sizeMetres + 0.5) * size;
    const markerY = y + (request.position[2] / plan.sizeMetres + 0.5) * size;
    context.beginPath();
    context.arc(markerX, markerY, 6, 0, Math.PI * 2);
    context.fillStyle = "rgb(255 79 45 / 35%)";
    context.strokeStyle = "#ff5b3b";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    context.font = "700 9px ui-monospace, monospace";
    context.fillStyle = "#fff1e9";
    context.strokeStyle = "rgb(43 11 5 / 92%)";
    context.lineWidth = 2.5;
    context.strokeText(request.id, markerX + 8, markerY - 6);
    context.fillText(request.id, markerX + 8, markerY - 6);
  }
  context.restore();
}

function rockMapLabel(rock: SeedWorldSolvedRockObb, formalIndexByRockId: ReadonlyMap<string, number>): string {
  const acceptanceLabel = /^acceptance-add:(A\d+):/u.exec(rock.id)?.[1];
  if (acceptanceLabel) return acceptanceLabel;
  const formalIndex = formalIndexByRockId.get(rock.id);
  return formalIndex === undefined ? rock.id : `P${String(formalIndex + 1).padStart(2, "0")}`;
}

/**
 * Draws one arrow per committed rock target, independently from rock-instance visibility.
 * @param context Target map canvas context.
 * @param plan World plan supplying the 3072-metre extent.
 * @param compilation Final rock targets shared with the 3D runtime.
 * @param x Map viewport origin X in CSS pixels.
 * @param y Map viewport origin Y in CSS pixels.
 * @param size Square map viewport size in CSS pixels.
 */
export function drawSeedWorldRockTargets(
  context: CanvasRenderingContext2D,
  plan: SeedWorldPlan,
  compilation: SeedWorldRockCompilation,
  x: number,
  y: number,
  size: number
): void {
  for (const target of compilation.terrain.targets) {
    drawCommittedTargetArrow(context, plan, target.shoulderFoot, target.crest, x, y, size);
  }
}

function drawCommittedTargetArrow(
  context: CanvasRenderingContext2D,
  plan: SeedWorldPlan,
  shoulderFoot: readonly [number, number, number],
  crest: readonly [number, number, number],
  x: number,
  y: number,
  size: number
): void {
  const startX = x + (shoulderFoot[0] / plan.sizeMetres + 0.5) * size;
  const startY = y + (shoulderFoot[2] / plan.sizeMetres + 0.5) * size;
  const endX = x + (crest[0] / plan.sizeMetres + 0.5) * size;
  const endY = y + (crest[2] / plan.sizeMetres + 0.5) * size;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 8;
  context.save();
  context.strokeStyle = "#ffe25f";
  context.fillStyle = "#ffe25f";
  context.lineWidth = 2.5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle - Math.PI / 6) * headLength, endY - Math.sin(angle - Math.PI / 6) * headLength);
  context.lineTo(endX - Math.cos(angle + Math.PI / 6) * headLength, endY - Math.sin(angle + Math.PI / 6) * headLength);
  context.closePath();
  context.fill();
  context.restore();
}

function roleFill(rock: SeedWorldSolvedRockObb): string {
  if (rock.role === "primary") return "rgb(245 191 82 / 76%)";
  if (rock.role === "upper-stack") return "rgb(118 219 255 / 72%)";
  if (rock.role === "shoulder-fill") return "rgb(255 127 203 / 72%)";
  return "rgb(141 239 153 / 72%)";
}

function roleStroke(rock: SeedWorldSolvedRockObb): string {
  if (rock.role === "primary") return "rgb(91 57 14 / 96%)";
  if (rock.role === "upper-stack") return "rgb(19 84 111 / 96%)";
  if (rock.role === "shoulder-fill") return "rgb(115 31 82 / 96%)";
  return "rgb(39 100 48 / 96%)";
}
