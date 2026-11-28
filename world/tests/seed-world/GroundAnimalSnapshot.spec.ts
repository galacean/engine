import { describe, expect, it } from "vitest";
import { GroundAnimalCrowd, type GroundAnimalBody } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";

function body(x: number): GroundAnimalBody {
  return {
    motion: { x, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    radius: 0.5,
    bodyLength: 1,
    desiredSpeed: 0,
    target: [x, 0],
    arrived: false,
    blocked: false,
    active: false,
    layer: "ground",
    elevation: 0,
    height: 1,
    steering: { maxAngularSpeed: 0.3, turnSpeedRatio: 0.5, arrivalRadius: 0.1 }
  };
}

describe.each([false, true])("immutable crowd queries (leased=%s)", (leased) => {
  const acquire = (crowd: GroundAnimalCrowd, self: GroundAnimalBody) =>
    leased ? crowd.acquireRouteQuery(self) : crowd.routeQuery(self, undefined, undefined, true);
  it.each(["motion", "radius", "elevation", "height", "layer", "arrivalRadius"] as const)(
    "keeps decision-time %s values stable across host writes, while new queries see the change",
    (field) => {
      const crowd = new GroundAnimalCrowd(),
        self = body(0),
        peer = body(10);
      crowd.add(self);
      crowd.add(peer);
      let from: [number, number] = [5, 0],
        to: [number, number] = [15, 0];
      if (field === "radius") {
        from = [5, 1.5];
        to = [15, 1.5];
      }
      if (field === "elevation") peer.layer = "air";
      if (field === "height") {
        peer.layer = self.layer = "air";
        self.elevation = 2;
      }
      if (field === "layer") peer.elevation = 5;
      if (field === "arrivalRadius") {
        crowd.reserve(peer, 20, 0);
        from = [19, 1.5];
        to = [21, 1.5];
      }
      const query = acquire(crowd, self);
      const before = query.canTraverse(from, to);
      if (field === "motion") peer.motion.x = 30;
      if (field === "radius") {
        expect(crowd.canResize(peer, 2)).toBe(true);
        peer.radius = 2;
      }
      if (field === "elevation") peer.elevation = 5;
      if (field === "height") peer.height = 4;
      if (field === "layer") peer.layer = "air";
      if (field === "arrivalRadius") (peer.steering as { arrivalRadius: number }).arrivalRadius = 2;
      expect(query.canTraverse(from, to)).toBe(before);
      expect(acquire(crowd, self).canTraverse(from, to)).toBe(!before);
      // Publishing the sleeper's grid location cannot retroactively change either snapshot.
      crowd.synchronizeDormantPosition(peer);
      expect(query.canTraverse(from, to)).toBe(before);
    }
  );

  it("captures changed reservations and membership without changing older snapshots", () => {
    const crowd = new GroundAnimalCrowd(),
      self = body(0),
      peer = body(10);
    crowd.add(self);
    crowd.add(peer);
    crowd.reserve(peer, 20, 0);
    const first = acquire(crowd, self);
    crowd.reserve(peer, 30, 0);
    const second = acquire(crowd, self);
    crowd.remove(peer);
    expect(first.canTraverse([19, 0], [21, 0])).toBe(false);
    expect(second.canTraverse([19, 0], [21, 0])).toBe(true);
    expect(second.canTraverse([29, 0], [31, 0])).toBe(false);
    expect(acquire(crowd, self).canTraverse([29, 0], [31, 0])).toBe(true);
  });
});

it("reuses published snapshots without scans and never overwrites a retained version", () => {
  const crowd = new GroundAnimalCrowd(),
    self = body(0),
    peer = body(10);
  crowd.add(self, true);
  crowd.add(peer, true);
  crowd.reserveRouteQueries(4, 3);
  const old = crowd.acquireRouteQuery(self);
  const initial = crowd.getRouteSnapshotDiagnostics();
  for (let i = 0; i < 32; i++) {
    const current = crowd.acquireRouteQuery(self);
    expect(current.canTraverse([5, 0], [15, 0])).toBe(false);
    current.release();
  }
  expect(crowd.getRouteSnapshotDiagnostics()).toEqual(initial);
  peer.motion.x = 30;
  crowd.synchronizeDormantPosition(peer);
  const moved = crowd.acquireRouteQuery(self);
  expect(moved.canTraverse([5, 0], [15, 0])).toBe(true);
  expect(old.canTraverse([5, 0], [15, 0])).toBe(false);
  moved.release();
  // Repeated captures may reuse the unreferenced slot, but not the held old snapshot.
  for (let i = 0; i < 20; i++) {
    peer.motion.x = 30 + i;
    crowd.synchronizeDormantPosition(peer);
    const current = crowd.acquireRouteQuery(self);
    current.release();
  }
  expect(old.canTraverse([5, 0], [15, 0])).toBe(false);
  old.release();
  old.release();
  expect(() => old.canTraverse([5, 0], [15, 0])).toThrow("released");
  expect(crowd.getRouteSnapshotDiagnostics()).toMatchObject({
    queries: 4,
    snapshots: 3,
    fallbackBodyChecks: 0,
    activeQueries: 0
  });
});

it("keeps leased obstruction values and traversal equivalent to the original query", () => {
  const crowd = new GroundAnimalCrowd(),
    self = body(0);
  crowd.add(self, true);
  for (let i = 1; i < 24; i++) {
    const peer = body(i * 4);
    peer.motion.z = (i % 3) * 4;
    crowd.add(peer, true);
    if (i % 2) crowd.reserve(peer, i * 4, 20);
  }
  const legacy = crowd.routeQuery(self, undefined, undefined, true),
    pooled = crowd.acquireRouteQuery(self);
  for (let i = 0; i < 200; i++) {
    const from: [number, number] = [(i % 7) - 3, (i % 5) - 2],
      to: [number, number] = [i % 100, (i % 35) - 5];
    expect(pooled.canTraverse(from, to, 0.2)).toBe(legacy.canTraverse(from, to, 0.2));
    expect(pooled.obstruction(from, to, 0.2)?.corners).toEqual(legacy.obstruction(from, to, 0.2)?.corners);
  }
  pooled.release();
});

it("preserves overlap escape, stationary and tangent decisions in pooled queries", () => {
  const crowd = new GroundAnimalCrowd(),
    self = body(0),
    peer = body(2);
  crowd.add(self);
  crowd.add(peer);
  peer.motion.x = 0.75;
  const pooled = crowd.acquireRouteQuery(self),
    legacy = crowd.routeQuery(self, undefined, undefined, true);
  for (const [x, z, tx, tz] of [
    [0, 0, -0.1, 0],
    [0, 0, 0.1, 0],
    [-0.1, 0, -0.2, 0],
    [0, 0, 0, 0],
    [1e-9, 1e-9, 1e-9, 1e-9],
    [0.1, 0, 0.1, 0],
    [-2, 1.001, 2, 1.001],
    [-2, 2, 2, -2]
  ]) {
    const from: [number, number] = [x, z],
      to: [number, number] = [tx, tz];
    expect(pooled.canTraverse(from, to)).toBe(legacy.canTraverse(from, to));
    expect(pooled.obstruction(from, to, 0)?.corners).toEqual(legacy.obstruction(from, to, 0)?.corners);
  }
  pooled.release();
});
