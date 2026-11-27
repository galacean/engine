/** A conservative box for one measured static storage-prop part, in prop-local metres. */
export interface StorageContainerPartBox {
  readonly name: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Part bounds measured from assets/storage/cart.glb's converted mesh vertices.
 * Source SHA256: d0a28aa874700f2a2bcc0074f65f1acead94baf8641196d10cb5f7b97eb954fb.
 * The -Z end is open above the bed; separate wheels and rails preserve that opening.
 * These boxes conservatively reject overlap and do not replace the source mesh for exact collision.
 */
export const STORAGE_CART_OBSTACLES: readonly StorageContainerPartBox[] = Object.freeze([
  { name: "bed-and-undercarriage", min: [-0.584, 0.316, -1.141], max: [0.587, 0.649, 1.141] },
  { name: "left-rail", min: [-0.622, 0.526, -1.014], max: [-0.328, 1.175, 1.11] },
  { name: "right-rail", min: [0.353, 0.526, -1.014], max: [0.647, 1.175, 1.11] },
  { name: "back-wall", min: [-0.587, 0.591, 0.907], max: [0.618, 1.179, 1.11] },
  { name: "left-front-wheel", min: [-0.715, 0, -1.095], max: [-0.534, 0.776, -0.319] },
  { name: "right-front-wheel", min: [0.534, 0, -1.095], max: [0.715, 0.776, -0.319] },
  { name: "left-rear-wheel", min: [-0.715, 0, 0.216], max: [-0.534, 0.776, 0.991] },
  { name: "right-rear-wheel", min: [0.534, 0, 0.216], max: [0.715, 0.776, 0.991] }
] satisfies StorageContainerPartBox[]);

/** Measured open end of the cart, above its bed, in prop-local metres. */
export const STORAGE_CART_OPENING = Object.freeze({ z: -1.141, minX: -0.328, maxX: 0.353, floorY: 0.649 });
