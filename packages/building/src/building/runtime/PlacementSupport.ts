export interface SupportCell {
  id: string;
  logical_id: string;
  /** Material randomness identity; editing/picking still use id/logical_id. */
  seed_id?: string;
  /** Distance atlas may include a cut variant suffix unlike the source material. */
  lod_seed_id?: string;
  surface_id: string;
  anchor_uv: number[];
  center: number[];
  tangent: number[];
  bitangent: number[];
  normal: number[];
  size: number[];
  /** Optional native brick deformation flags; other material adapters ignore them. */
  brick_flags?: number;
  /** Wood plank shape flags: 64 and 128 keep the bevelled start and end at their size. */
  plank_flags?: number;
  /** Original metric bottom-left/right and top-left/right vertical offsets. */
  brick_deformation?: number[];
  /** Original recipe seed, retained through clipping and material changes. */
  brick_seed?: number;
  /** Accent stone: the brick shader draws it as a different stone. */
  brick_accent?: boolean;
  /** Where the brick lies along its wall, in metres; the brick shader maps its texture by it. */
  brick_span?: [number, number];
  /** Effective boundary interval in the owning wall metre chart, after contact cuts. */
  boundaryU?: [number, number];
}
