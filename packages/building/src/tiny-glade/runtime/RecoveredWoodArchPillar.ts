import { add, sub, mul, f32 } from "./RecoveredRoofMath";

export interface WoodArchPillarInput {
  /** XZ wall tangent, already normalized by the proposal owner. */
  direction: readonly [number, number];
  position: readonly [number, number, number];
  height: number;
  depth: number;
  width: number;
  embed: number;
  extension: number;
  gateSeed: number;
  pieceSeed: number;
  colorId: number;
}

/** Original emit_pillar_at_point, 0x1010e1724. The caller selects the section,
 * ground embedding and top extension; this emitter does not choose supports or
 * modify terrain. The original affine packer and WoodenPlankSsbo defaults yield
 * an 80-byte instance, consumed by the existing wood shader, not the arch shader.
 * REA ev_09885b8694fa7b9b288df1fed3534a792023e076d9f706b8adec7922ec03edce.
 */
export function woodArchPillar(input: WoodArchPillarInput): ArrayBuffer {
  const finite = (n: number) => Number.isFinite(f32(n));
  const uint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    input.direction.length !== 2 ||
    input.position.length !== 3 ||
    ![
      ...input.direction,
      ...input.position,
      input.height,
      input.depth,
      input.width,
      input.embed,
      input.extension
    ].every(finite) ||
    !(f32(input.depth) > 0 && f32(input.width) > 0) ||
    ![input.gateSeed, input.pieceSeed, input.colorId].every(uint)
  )
    throw RangeError("Invalid wooden arch pillar input");
  const tangent = [f32(input.direction[0]), 0, f32(input.direction[1])];
  // Keep the original separate float32 adds: extension + ((height + embed) + .1).
  const extent = add(input.extension, add(add(input.height, input.embed), 0.1));
  if (!(extent > 0) || !Number.isFinite(extent)) throw RangeError("Invalid wooden arch pillar extent");
  const normal = [add(mul(tangent[2], 1), mul(0, -0)), 0, add(mul(0, 0), mul(tangent[0], -1))];
  const across = normal.map((n, i) => add(mul(tangent[i], 0), add(mul(n, input.depth), 0)));
  const up = normal.map((n, i) => add(mul(tangent[i], 0), add(mul(i === 1 ? 1 : 0, extent), mul(n, 0))));
  const along = tangent.map((t, i) => add(mul(t, input.width), add(mul(normal[i], 0), 0)));
  const origin = input.position.map((p, i) =>
    add(sub(p, mul(input.embed, i === 1 ? 1 : 0)), add(mul(tangent[i], 0), add(mul(normal[i], 0), 0)))
  );
  const transform = [...across, ...up, ...along, ...origin];
  if (!transform.every(Number.isFinite)) throw RangeError("Invalid wooden arch pillar transform");
  const bytes = new ArrayBuffer(80),
    view = new DataView(bytes);
  transform.forEach((v, i) => view.setFloat32(i * 4, v, true));
  view.setUint32(48, input.gateSeed, true);
  view.setUint32(52, input.pieceSeed, true);
  view.setUint32(56, input.colorId, true);
  // Original default flags, cut address/list and padding are all zero.
  return bytes;
}
