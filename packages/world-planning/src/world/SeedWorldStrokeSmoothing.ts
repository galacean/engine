import type { ViewAnnotation, ViewPoint } from "./SeedWorldViewSnapshot";

export interface SmoothedStrokeSample {
  readonly x: number;
  readonly y: number;
  /** Cumulative arc length from stroke start, in the same coordinate space as input points. */
  readonly arc: number;
  /** Normalized progress along the stroke in [0, 1]. */
  readonly progress: number;
  /** Local visual core radius at this sample. */
  readonly radius: number;
}

export interface StrokeSmoothingOptions {
  /** Base visual core radius in input point units (image pixels). */
  readonly baseRadius: number;
  /** Maximum spacing between consecutive resampled points along curves. */
  readonly maxSegmentStep: number;
  /** True while the user is actively dragging this stroke (adds subtle liquid tip swell). */
  readonly active?: boolean;
}

export interface CapsuleSegmentVertexData {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radiusStart: number;
  readonly radiusEnd: number;
  readonly tipStart: number;
  readonly tipEnd: number;
  readonly arcStart: number;
  readonly arcEnd: number;
}

const EPSILON = 1e-4;

function dist(a: ViewPoint, b: ViewPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Evaluate a single centripetal Catmull-Rom point (alpha = 0.5) between p1 and p2.
 * Centripetal parameterization prevents cusps and self-intersections on sharp turns.
 */
function evalCentripetalCatmullRom(p0: ViewPoint, p1: ViewPoint, p2: ViewPoint, p3: ViewPoint, u: number): ViewPoint {
  const d01 = Math.max(EPSILON, Math.sqrt(dist(p0, p1)));
  const d12 = Math.max(EPSILON, Math.sqrt(dist(p1, p2)));
  const d23 = Math.max(EPSILON, Math.sqrt(dist(p2, p3)));

  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const t = t1 + (t2 - t1) * u;

  const inv10 = 1 / Math.max(EPSILON, t1 - t0);
  const inv21 = 1 / Math.max(EPSILON, t2 - t1);
  const inv32 = 1 / Math.max(EPSILON, t3 - t2);
  const inv20 = 1 / Math.max(EPSILON, t2 - t0);
  const inv31 = 1 / Math.max(EPSILON, t3 - t1);

  const a1x = ((t1 - t) * p0.x + (t - t0) * p1.x) * inv10;
  const a1y = ((t1 - t) * p0.y + (t - t0) * p1.y) * inv10;
  const a2x = ((t2 - t) * p1.x + (t - t1) * p2.x) * inv21;
  const a2y = ((t2 - t) * p1.y + (t - t1) * p2.y) * inv21;
  const a3x = ((t3 - t) * p2.x + (t - t2) * p3.x) * inv32;
  const a3y = ((t3 - t) * p2.y + (t - t2) * p3.y) * inv32;

  const b1x = ((t2 - t) * a1x + (t - t0) * a2x) * inv20;
  const b1y = ((t2 - t) * a1y + (t - t0) * a2y) * inv20;
  const b2x = ((t3 - t) * a2x + (t - t1) * a3x) * inv31;
  const b2y = ((t3 - t) * a2y + (t - t1) * a3y) * inv31;

  return {
    x: ((t2 - t) * b1x + (t - t1) * b2x) * inv21,
    y: ((t2 - t) * b1y + (t - t1) * b2y) * inv21
  };
}

/** Deduplicate near-identical consecutive points and apply gentle one-pass Laplacian smoothing on interior points. */
function cleanControlPoints(points: readonly ViewPoint[], minSpacing: number): ViewPoint[] {
  if (points.length <= 1) return points.map((p) => ({ x: p.x, y: p.y }));
  const deduped: ViewPoint[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = deduped[deduped.length - 1];
    if (dist(prev, p) >= minSpacing || i === points.length - 1) {
      if (dist(prev, p) >= EPSILON) {
        deduped.push({ x: p.x, y: p.y });
      }
    }
  }
  if (deduped.length <= 2) return deduped;

  // Light jitter-removal pass preserving exact start & end anchors.
  const smoothed: ViewPoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = deduped[i - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    smoothed.push({
      x: prev.x * 0.18 + curr.x * 0.64 + next.x * 0.18,
      y: prev.y * 0.18 + curr.y * 0.64 + next.y * 0.18
    });
  }
  smoothed.push(deduped[deduped.length - 1]);
  return smoothed;
}

/** Smooth raw pointer polyline into a dense centripetal Catmull-Rom polyline. */
export function smoothPolyline(points: readonly ViewPoint[], maxSegmentStep: number): ViewPoint[] {
  if (points.length <= 1) return points.map((p) => ({ x: p.x, y: p.y }));
  const step = Math.max(0.5, maxSegmentStep);
  const control = cleanControlPoints(points, step * 0.25);
  if (control.length === 1) return control;
  if (control.length === 2) {
    const a = control[0];
    const b = control[1];
    const segLen = dist(a, b);
    const subdivisions = Math.max(1, Math.min(24, Math.ceil(segLen / step)));
    const result: ViewPoint[] = [a];
    for (let s = 1; s <= subdivisions; s++) {
      const t = s / subdivisions;
      result.push(s === subdivisions ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return result;
  }

  const out: ViewPoint[] = [control[0]];
  const lastIndex = control.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const p1 = control[i];
    const p2 = control[i + 1];
    // Phantom endpoints mirror the tangent cleanly at start and end.
    const p0 = i > 0 ? control[i - 1] : { x: p1.x * 2 - p2.x, y: p1.y * 2 - p2.y };
    const p3 = i + 2 <= lastIndex ? control[i + 2] : { x: p2.x * 2 - p1.x, y: p2.y * 2 - p1.y };
    const chord = dist(p1, p2);
    const subdivisions = Math.max(1, Math.min(20, Math.ceil(chord / step)));
    for (let s = 1; s <= subdivisions; s++) {
      out.push(s === subdivisions ? p2 : evalCentripetalCatmullRom(p0, p1, p2, p3, s / subdivisions));
    }
  }
  return out;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(EPSILON, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Resample a freehand stroke with organic Apple-style start/end tapering and arc-length metadata.
 */
export function buildSmoothedStrokeSamples(
  points: readonly ViewPoint[],
  options: StrokeSmoothingOptions
): SmoothedStrokeSample[] {
  const baseRadius = Math.max(0.5, options.baseRadius);
  if (!points.length) return [];
  const curve = smoothPolyline(points, options.maxSegmentStep);
  if (curve.length === 1) {
    return [{ x: curve[0].x, y: curve[0].y, arc: 0, progress: 1, radius: baseRadius * 1.06 }];
  }

  const arcs: number[] = [0];
  for (let i = 1; i < curve.length; i++) {
    arcs.push(arcs[i - 1] + dist(curve[i - 1], curve[i]));
  }
  const totalArc = arcs[arcs.length - 1];
  if (totalArc < EPSILON) {
    return [{ x: curve[0].x, y: curve[0].y, arc: 0, progress: 1, radius: baseRadius * 1.06 }];
  }

  const startTaperLen = Math.min(totalArc * 0.32, baseRadius * 2.4);
  const endTaperLen = Math.min(totalArc * 0.32, baseRadius * 2.8);
  const active = !!options.active;

  return curve.map((pt, i) => {
    const arc = arcs[i];
    const progress = arc / totalArc;
    const fromEnd = totalArc - arc;
    // Soft rounded entry so stroke starts never look harshly chopped.
    const startFactor = 0.78 + 0.22 * smoothstep(0, startTaperLen, arc);
    // Active finger tip forms a subtle liquid droplet; released strokes taper gracefully.
    const endFactor = active
      ? 1.0 + 0.1 * (1 - smoothstep(0, endTaperLen, fromEnd))
      : 0.84 + 0.16 * smoothstep(0, endTaperLen, fromEnd);
    return {
      x: pt.x,
      y: pt.y,
      arc,
      progress,
      radius: baseRadius * startFactor * endFactor
    };
  });
}

/**
 * Convert view annotations into tapered capsule segments ready for the GPU `BlendOperation.Max` SDF pass.
 */
export function buildStrokeCapsuleSegments(
  marks: readonly Pick<ViewAnnotation, "points" | "width">[],
  imageWidth: number,
  imageHeight: number,
  options: {
    readonly activeStrokeIndex?: number;
  } = {}
): CapsuleSegmentVertexData[] {
  const segments: CapsuleSegmentVertexData[] = [];
  const imageShortSide = Math.max(1, Math.min(imageWidth, imageHeight));
  const minVisualRadius = imageShortSide * 0.0085;
  const maxVisualRadius = imageShortSide * 0.024;
  const maxStep = Math.max(1.5, imageShortSide * 0.0045);

  for (let strokeIndex = 0; strokeIndex < marks.length; strokeIndex++) {
    const mark = marks[strokeIndex];
    if (!mark.points.length) continue;
    const isActive = options.activeStrokeIndex === strokeIndex;
    // Translate the 3px logical annotation width into a lush Apple Clean Up ribbon core (~6-8 CSS px).
    const baseRadius = Math.max(minVisualRadius, Math.min(maxVisualRadius, mark.width * 2.15));
    const samples = buildSmoothedStrokeSamples(mark.points, {
      baseRadius,
      maxSegmentStep: maxStep,
      active: isActive
    });
    if (!samples.length) continue;

    if (samples.length === 1) {
      const s = samples[0];
      segments.push({
        ax: s.x,
        ay: s.y,
        bx: s.x,
        by: s.y,
        radiusStart: s.radius,
        radiusEnd: s.radius,
        tipStart: isActive ? 1 : 0,
        tipEnd: isActive ? 1 : 0,
        arcStart: 1,
        arcEnd: 1
      });
      continue;
    }

    const totalArc = samples[samples.length - 1].arc;
    const tipTailLen = Math.max(baseRadius * 7.5, imageShortSide * 0.09);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const tipStart = isActive ? Math.pow(smoothstep(totalArc - tipTailLen, totalArc, a.arc), 1.55) : 0;
      const tipEnd = isActive ? Math.pow(smoothstep(totalArc - tipTailLen, totalArc, b.arc), 1.55) : 0;
      segments.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        radiusStart: a.radius,
        radiusEnd: b.radius,
        tipStart,
        tipEnd,
        arcStart: a.progress,
        arcEnd: b.progress
      });
    }
  }
  return segments;
}
