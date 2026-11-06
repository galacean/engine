import * as z from "zod";

export const viewerRelationSchema = z
  .object({
    basis: z.enum(["instruction-viewer", "live-viewer"]),
    forwardMetres: z.number(),
    rightMetres: z.number(),
    direction: z.enum([
      "here",
      "front",
      "front-right",
      "right",
      "behind-right",
      "behind",
      "behind-left",
      "left",
      "front-left"
    ])
  })
  .describe(
    "相对玩家的水平位置事实：任务中使用提交指令时的视角，任务外用实时视角。forwardMetres正值在前，rightMetres正值在右；direction为八方位扇区，不是世界东西南北。"
  );

export type ViewerRelation = z.output<typeof viewerRelationSchema>;

/** Horizontal right is forward cross world-up, independent of world-axis signs. */
export function viewerRelativePosition(
  position: readonly number[],
  forward: readonly number[],
  target: readonly number[],
  frozen: boolean
): ViewerRelation {
  const length = Math.hypot(forward[0], forward[2]);
  const fx = length > 1e-8 ? forward[0] / length : 0;
  const fz = length > 1e-8 ? forward[2] / length : 1;
  const dx = target[0] - position[0],
    dz = target[2] - position[2];
  const forwardMetres = dx * fx + dz * fz,
    rightMetres = -dx * fz + dz * fx;
  const directions = [
    "front",
    "front-right",
    "right",
    "behind-right",
    "behind",
    "behind-left",
    "left",
    "front-left"
  ] as const;
  return {
    basis: frozen ? "instruction-viewer" : "live-viewer",
    forwardMetres,
    rightMetres,
    direction:
      Math.hypot(dx, dz) < 0.01
        ? "here"
        : directions[(Math.round(Math.atan2(rightMetres, forwardMetres) / (Math.PI / 4)) + 8) % 8]
  };
}
