import { describe, expect, it } from "vitest";
import {
  buildSmoothedStrokeSamples,
  buildStrokeCapsuleSegments,
  smoothPolyline
} from "../src/world/SeedWorldStrokeSmoothing";

describe("SeedWorldStrokeSmoothing", () => {
  it("preserves single-point taps as a valid circular capsule with finite attributes", () => {
    const segments = buildStrokeCapsuleSegments(
      [{ points: [{ x: 320, y: 240 }], width: 3 }],
      1280,
      720,
      { activeStrokeIndex: 0 }
    );
    expect(segments).toHaveLength(1);
    const seg = segments[0];
    expect(seg.ax).toBe(320);
    expect(seg.ay).toBe(240);
    expect(seg.bx).toBe(320);
    expect(seg.by).toBe(240);
    expect(seg.radiusStart).toBeGreaterThan(0);
    expect(seg.radiusEnd).toBe(seg.radiusStart);
    expect(seg.tipStart).toBe(1);
    expect(seg.tipEnd).toBe(1);
  });

  it("smooths sharp polylines via centripetal Catmull-Rom while keeping exact endpoints", () => {
    const raw = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 200 }
    ];
    const smooth = smoothPolyline(raw, 8);
    expect(smooth.length).toBeGreaterThan(raw.length * 4);
    expect(smooth[0]).toEqual(raw[0]);
    expect(smooth[smooth.length - 1]).toEqual(raw[raw.length - 1]);

    // Every point remains finite and stays cleanly inside a tight envelope around the control polygon (no overshoot cusps).
    for (let i = 1; i < smooth.length; i++) {
      const a = smooth[i - 1];
      const b = smooth[i];
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(95);
      expect(b.x).toBeLessThanOrEqual(305);
      expect(b.y).toBeGreaterThanOrEqual(95);
      expect(b.y).toBeLessThanOrEqual(205);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(10);
    }
  });

  it("applies organic start taper, subtle liquid tip swell while active, and graceful release taper", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 160, y: 0 }
    ];
    const active = buildSmoothedStrokeSamples(line, { baseRadius: 8, maxSegmentStep: 4, active: true });
    const released = buildSmoothedStrokeSamples(line, { baseRadius: 8, maxSegmentStep: 4, active: false });

    const mid = Math.floor(active.length / 2);
    expect(active[0].radius).toBeLessThan(active[mid].radius);
    expect(active[active.length - 1].radius).toBeGreaterThan(active[mid].radius);
    expect(released[released.length - 1].radius).toBeLessThan(released[mid].radius);
  });

  it("isolates active tip comet energy to the currently drawing stroke", () => {
    const marks = [
      {
        points: [
          { x: 40, y: 40 },
          { x: 160, y: 40 },
          { x: 240, y: 120 }
        ],
        width: 3
      },
      {
        points: [
          { x: 300, y: 200 },
          { x: 420, y: 220 },
          { x: 520, y: 310 }
        ],
        width: 3
      }
    ];

    const drawingSegments = buildStrokeCapsuleSegments(marks, 1280, 720, { activeStrokeIndex: 1 });
    const stroke0Segments = drawingSegments.filter((s) => s.ax < 260);
    const stroke1Segments = drawingSegments.filter((s) => s.ax >= 260);
    expect(stroke0Segments.every((s) => s.tipStart === 0 && s.tipEnd === 0)).toBe(true);
    expect(stroke1Segments[stroke1Segments.length - 1].tipEnd).toBeCloseTo(1, 3);
    expect(stroke1Segments[0].tipStart).toBeLessThan(0.2);

    const idleSegments = buildStrokeCapsuleSegments(marks, 1280, 720);
    expect(idleSegments.every((s) => s.tipStart === 0 && s.tipEnd === 0)).toBe(true);
  });
});
