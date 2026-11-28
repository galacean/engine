// Part-type layer: geometry of free-standing walls, fences and flights of steps.
// It only describes where things are. How units are laid stays in the algorithms.
// The ground comes from the environment interface; the terrain system implements it.
import {
  sinCos,
  type BuildingEnvironment,
  type BuildingGeometry,
  type BuildingRegistry,
  type Frame,
  type GeometryElement,
  type GeometryGenerator,
  type LayingAlgorithm,
  type SurfaceKind,
  type Vec3,
  ribbon
} from "../core";

export interface StripRectangle {
  /** Centerline on the ground: center (x, z), size (length, depth), rotation about +Y. */
  readonly center: readonly [number, number];
  readonly size: readonly [number, number];
  readonly rotation: number;
}
export interface StripParams {
  readonly rectangle: StripRectangle;
  readonly height: number;
}
export interface FenceParams extends StripParams {
  /** Posts divide the length into equal spans no longer than this. */
  readonly maxSpacing: number;
  /** Rail heights, as fractions of the post height. */
  readonly levels: readonly number[];
}

const flatGround = () => 0;
function ground(environment: BuildingEnvironment, x: number, z: number): number {
  const y = (environment.ground ?? flatGround)(x, z);
  if (!Number.isFinite(y)) throw Error("The ground height must be finite");
  return y;
}
/** Horizontal placement along the strip: x is the offset from the center. */
function along(r: StripRectangle) {
  const [s, c] = sinCos(r.rotation);
  return {
    s,
    c,
    at: (x: number): [number, number] => [r.center[0] + c * x, r.center[1] + s * x]
  };
}

/** A vertical face standing on the ground. u = metres from the start, v = height above
 * the ground at that point. Axes stay upright: the face follows the ground, it does not tilt. */
export const groundStripSurface: SurfaceKind<StripParams> = {
  domain: (p) => ({ u: [0, p.rectangle.size[0]], v: [0, p.height], closedU: false }),
  frame: (p, u, v, environment): Frame => {
    const { s, c, at } = along(p.rectangle);
    const [x, z] = at(u - p.rectangle.size[0] / 2);
    return { origin: [x, ground(environment, x, z) + v, z], x: [c, 0, s], y: [0, 1, 0], z: [-s, 0, c] };
  }
};

/** Element "face": the strip as a ground-following surface. */
export const stripGeometry: GeometryGenerator<StripParams> = (p) => ({
  elements: { face: { kind: "surface", surface: { kind: "groundStrip", params: p } } }
});

/** Elements "post:i" (points on the ground at every span boundary) and "level:j"
 * (polylines through the posts at each rail height, so each segment spans two posts). */
export const fenceGeometry: GeometryGenerator<FenceParams> = (p, { environment }) => {
  const length = p.rectangle.size[0];
  const spans = Math.max(1, Math.ceil(length / p.maxSpacing)),
    spacing = length / spans;
  const { s, c, at } = along(p.rectangle);
  const feet: Vec3[] = [];
  for (let i = 0; i <= spans; i++) {
    const [x, z] = at(-length / 2 + i * spacing);
    feet.push([x, ground(environment, x, z), z]);
  }
  const elements: Record<string, GeometryElement> = {};
  feet.forEach((origin, i) => {
    elements[`post:${i}`] = { kind: "point", frame: { origin, x: [c, 0, s], y: [0, 1, 0], z: [-s, 0, c] } };
  });
  p.levels.forEach((level, j) => {
    elements[`level:${j}`] = ribbon({ points: feet.map(([x, y, z]) => [x, y + p.height * level, z] as Vec3) });
  });
  return { elements } satisfies BuildingGeometry;
};

export interface StepFlightParams {
  /** Foot of the flight on the ground: x, height above the ground, z. */
  readonly position: readonly [number, number, number];
  /** Direction the flight climbs, as a rotation about +Y from +Z. Default: 0. */
  readonly rotation?: number;
  readonly width: number;
  readonly rise: number;
  readonly run: number;
  readonly count: number;
}
/** Element "foot": the foot of a flight of steps on the ground. Its z axis climbs the
 * flight; its x axis runs across it. */
export const stepFlightGeometry: GeometryGenerator<StepFlightParams> = (p, { environment }) => {
  if (!(p.count >= 1 && Number.isInteger(p.count) && p.width > 0 && p.rise > 0 && p.run > 0))
    throw Error("A flight of steps needs a whole count and a positive width, rise and run");
  const [s, c] = sinCos(p.rotation ?? 0);
  const [x, y, z] = p.position;
  return {
    elements: {
      foot: {
        kind: "point",
        frame: { origin: [x, ground(environment, x, z) + y, z], x: [c, 0, -s], y: [0, 1, 0], z: [s, 0, c] }
      }
    }
  };
};
interface StepBlockParams {
  readonly width: number;
  readonly rise: number;
  readonly run: number;
  readonly count: number;
}
/** One solid block per step, from the foot of the flight up to the step's tread. */
export const stepBlocks: LayingAlgorithm<StepBlockParams, null> = {
  info: {
    accepts: ["point"],
    summary: 'Solid steps climbing from the point "foot": step i rises (i + 1) × rise over one run.',
    params: {
      width: "Width across the flight.",
      rise: "Height of one step.",
      run: "Depth of one step.",
      count: "Steps."
    }
  },
  plan: (context) => ({ count: context.params.count, data: null }),
  unitAt(context, _data, i) {
    const p = context.params,
      foot = context.geometry.point("foot");
    const height = p.rise * (i + 1),
      along = p.run * (i + 0.5);
    return {
      key: String(i),
      frame: {
        ...foot,
        origin: [0, 1, 2].map((k) => foot.origin[k] + foot.z[k] * along + foot.y[k] * (height / 2)) as unknown as Vec3
      },
      size: [p.width, height, p.run]
    };
  }
};

/** Registers the strip part types into a registry. */
export function registerStripTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.surfaces.register("groundStrip", groundStripSurface);
  registry.geometry.register("strip", stripGeometry);
  registry.geometry.register("fence", fenceGeometry);
  registry.geometry.register("stepFlight", stepFlightGeometry);
  registry.algorithms.register("stepBlocks", stepBlocks);
  return registry;
}
