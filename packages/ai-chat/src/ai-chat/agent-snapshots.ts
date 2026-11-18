import * as z from "zod";
import { assertProjectPath } from "@galacean/engine-project/project-files/virtual-project-files";

export const SNAPSHOT_DIRECTORY = ".ai/snapshots";
export const isSnapshotPath = (path: string) => path.startsWith(`${SNAPSHOT_DIRECTORY}/`);
const point = z.strictObject({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
export const snapshotPickSchema = z.strictObject({
  file_path: z.string().min(1).max(240),
  points: z.array(point).min(1).max(256).nullish(),
  region: z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("polygon"), points: z.array(point).min(3).max(4096) }),
      z.strictObject({
        kind: z.literal("stroke"),
        points: z.array(point).min(1).max(4096),
        radius: z.number().positive().finite()
      })
    ])
    .nullish(),
  offset: z.number().int().nonnegative().nullish(),
  limit: z.number().int().min(1).max(100).nullish()
});
export type SnapshotPickInput = z.output<typeof snapshotPickSchema>;
export function parseSnapshotPick(input: unknown): SnapshotPickInput {
  const value = snapshotPickSchema.parse(input);
  assertProjectPath(value.file_path);
  if (!isSnapshotPath(value.file_path)) throw new Error("pick.file_path must name a file under .ai/snapshots/");
  if (Boolean(value.points) === Boolean(value.region)) throw new Error("Provide either points or region, not both");
  if (value.points && (value.offset != null || value.limit != null))
    throw new Error("offset and limit apply only to region queries");
  return value;
}
export function snapshotError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
