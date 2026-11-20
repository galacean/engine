import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningPlayerState } from "@galacean/engine-world-planning/spatial/runtime/PlanningPlayerState";
import {
  normalizeSeedWorldCameraYawDegrees,
  quantizeSeedWorldCameraNumber,
  resolveSeedWorldCameraAngles,
  resolveSeedWorldCameraAnglesInto,
  writeSeedWorldCameraBookmark,
  type SeedWorldCameraBookmark
} from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";
import {
  SEED_WORLD_PLAYER_DEBOUNCE_MS,
  SEED_WORLD_PLAYER_MAX_WAIT_MS,
  SeedWorldPlayerState,
  seedWorldPlayerStateKey
} from "@galacean/engine-world-planning/world/SeedWorldPlayerState";
import { SeedWorldSaveScheduler } from "@galacean/engine-world-planning/world/SeedWorldSaveScheduler";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        data.set(key, value);
      })
    }
  };
}

describe("SeedWorldCameraBookmark zero-GC helpers", () => {
  it("resolveSeedWorldCameraAnglesInto matches resolveSeedWorldCameraAngles in place", () => {
    const out = { yawDegrees: -999, pitchDegrees: -999 };
    const vectors = [
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0.5, z: -2 },
      { x: -3.25, y: -1.5, z: 0.75 }
    ];
    for (const forward of vectors) {
      const expected = resolveSeedWorldCameraAngles(forward);
      const returned = resolveSeedWorldCameraAnglesInto(forward, out);
      expect(returned).toBe(out);
      expect(out.yawDegrees).toBe(expected.yawDegrees);
      expect(out.pitchDegrees).toBe(expected.pitchDegrees);
    }
    expect(() => resolveSeedWorldCameraAnglesInto({ x: 0, y: 0, z: 0 }, out)).toThrow(RangeError);
  });

  it("quantizeSeedWorldCameraNumber preserves millimetre / 0.001-degree bucketing", () => {
    expect(quantizeSeedWorldCameraNumber(0.00049)).toBe(0);
    expect(quantizeSeedWorldCameraNumber(-0.00049)).toBe(0);
    expect(quantizeSeedWorldCameraNumber(-0)).toBe(0);
    expect(quantizeSeedWorldCameraNumber(0.0005)).toBe(1);
    expect(quantizeSeedWorldCameraNumber(-0.0005)).toBe(-1);
    expect(quantizeSeedWorldCameraNumber(1.00049)).toBe(1000);
    expect(quantizeSeedWorldCameraNumber(-1.00049)).toBe(-1000);
    expect(quantizeSeedWorldCameraNumber(1.00051)).toBe(1001);
    expect(quantizeSeedWorldCameraNumber(-1.00051)).toBe(-1001);
    expect(quantizeSeedWorldCameraNumber(12.3456)).toBe(12346);
    expect(quantizeSeedWorldCameraNumber(-12.3456)).toBe(-12346);
    expect(normalizeSeedWorldCameraYawDegrees(-45)).toBe(315);
  });
});

describe("SeedWorldPlayerState", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("avoids URLSearchParams construction during stationary and sub-millimetre observe calls", async () => {
    vi.useFakeTimers();
    const { storage, data } = createMemoryStorage();
    const OriginalURLSearchParams = globalThis.URLSearchParams;
    let urlSearchParamsCalls = 0;
    const SpyURLSearchParams = function (
      this: unknown,
      ...args: ConstructorParameters<typeof URLSearchParams>
    ) {
      urlSearchParamsCalls++;
      return new OriginalURLSearchParams(...args);
    } as unknown as typeof URLSearchParams;
    vi.stubGlobal("URLSearchParams", SpyURLSearchParams);

    const state = new SeedWorldPlayerState("123", () => storage);
    const bookmark: SeedWorldCameraBookmark = {
      position: [1.234, 5.678, -9.012],
      yawDegrees: 45.5,
      pitchDegrees: -12.25,
      mode: "roam"
    };

    state.observe(bookmark);
    expect(urlSearchParamsCalls).toBe(0);
    expect(storage.setItem).not.toHaveBeenCalled();

    // Exact stationary frames + sub-mm / <0.001deg settling jitter + yaw equivalent (-314.5 === 45.5)
    for (let i = 0; i < 120; i++) {
      state.observe(bookmark);
      state.observe({
        position: [1.2341, 5.6782, -9.0122],
        yawDegrees: -314.4998,
        pitchDegrees: -12.2503,
        mode: "roam",
        orbitDistanceMetres: i // ignored in roam mode
      });
    }
    expect(urlSearchParamsCalls).toBe(0);
    expect(storage.setItem).not.toHaveBeenCalled();

    await state.flush();
    expect(urlSearchParamsCalls).toBe(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const expectedQuery = writeSeedWorldCameraBookmark(new OriginalURLSearchParams(), bookmark).toString();
    const stored = JSON.parse([...data.values()][0]!);
    expect(stored).toEqual({ schemaVersion: 1, camera: expectedQuery });
    state.dispose();
  });

  it("snapshots scalar values immediately when the caller reuses a mutable bookmark", async () => {
    const { storage, data } = createMemoryStorage();
    const state = new SeedWorldPlayerState("42", () => storage);
    const reusablePosition: [number, number, number] = [10, 20, 30];
    const reusableBookmark: {
      position: [number, number, number];
      yawDegrees: number;
      pitchDegrees: number;
      mode: SeedWorldCameraBookmark["mode"];
      orbitDistanceMetres?: number;
    } = {
      position: reusablePosition,
      yawDegrees: -90,
      pitchDegrees: 15.125,
      mode: "orbit",
      orbitDistanceMetres: 18.75
    };

    state.observe(reusableBookmark);

    // Mutate caller scratch buffer before flush runs (simulates reusing the bookmark object without re-observing)
    reusablePosition[0] = 999;
    reusablePosition[1] = 999;
    reusablePosition[2] = 999;
    reusableBookmark.yawDegrees = 0;
    reusableBookmark.pitchDegrees = 0;
    reusableBookmark.mode = "roam";
    reusableBookmark.orbitDistanceMetres = undefined;

    await state.flush();
    expect(state.load()).toEqual({
      position: [10, 20, 30],
      yawDegrees: 270,
      pitchDegrees: 15.125,
      mode: "orbit",
      orbitDistanceMetres: 18.75
    });

    // Next frame observes the updated reused bookmark
    reusablePosition[0] = 4;
    reusablePosition[1] = 5;
    reusablePosition[2] = 6;
    reusableBookmark.yawDegrees = 359.9999;
    reusableBookmark.pitchDegrees = -0.0002;
    state.observe(reusableBookmark);

    await state.flush();
    expect(JSON.parse([...data.values()][0]!)).toEqual({
      schemaVersion: 1,
      camera: "camera=4%2C5%2C6%2C360%2C0&cameraMode=roam"
    });
    expect(state.load()).toEqual({
      position: [4, 5, 6],
      yawDegrees: 0,
      pitchDegrees: 0,
      mode: "roam"
    });
    state.dispose();
  });

  it("avoids per-frame timer thrashing during continuous movement and flushes on debounce and maxWait", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { storage } = createMemoryStorage();
    const state = new SeedWorldPlayerState("continuous", () => storage);
    const bookmark = {
      position: [0, 0, 0] as [number, number, number],
      yawDegrees: 0,
      pitchDegrees: 0,
      mode: "roam" as const
    };

    // Simulate 180 moving frames (~2.88s @ 60fps); timer should be armed once without clear/reset every frame.
    for (let i = 0; i < 180; i++) {
      bookmark.position[0] = i * 0.1;
      state.observe(bookmark);
      await vi.advanceTimersByTimeAsync(16);
    }
    const lastMoveAt = 10_000 + 179 * 16;
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    // At 10_000 + debounceMs, initial timer fires and reschedules once to lastMoveAt + debounceMs.
    await vi.advanceTimersByTimeAsync(SEED_WORLD_PLAYER_DEBOUNCE_MS - 180 * 16);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    expect(storage.setItem).not.toHaveBeenCalled();

    // Just before 4s after the last move, still unwritten; at exact debounceMs after last move, flushes once.
    const remaining = lastMoveAt + SEED_WORLD_PLAYER_DEBOUNCE_MS - Date.now();
    await vi.advanceTimersByTimeAsync(remaining - 1);
    expect(storage.setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(state.load()?.position[0]).toBeCloseTo(17.9, 3);

    // Nonstop movement hits SEED_WORLD_PLAYER_MAX_WAIT_MS cleanly with O(maxWait / debounce) timers.
    setTimeoutSpy.mockClear();
    clearTimeoutSpy.mockClear();
    storage.setItem.mockClear();
    for (let t = 0; t < SEED_WORLD_PLAYER_MAX_WAIT_MS; t += 100) {
      bookmark.position[2] = (t + 100) * 0.01;
      state.observe(bookmark);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.length).toBeLessThanOrEqual(4);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    state.dispose();
  });
});

describe("SeedWorldSaveScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defers capture when blocked and flushes promptly on notifyCaptureReady", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    let canCapture = false;
    let value = 0;
    const saved: number[] = [];
    const scheduler = new SeedWorldSaveScheduler<number>({
      capture: () => value,
      save: async (snapshot) => {
        saved.push(snapshot);
      },
      onStatus: () => {},
      debounceMs: 100,
      maxWaitMs: 300,
      canCapture: () => canCapture
    });

    value = 1;
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(100);
    expect(saved).toEqual([]);

    // Subsequent edits while blocked stay deferred until readiness notification.
    value = 2;
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([]);

    canCapture = true;
    scheduler.notifyCaptureReady();
    await Promise.resolve();
    await vi.waitFor(() => {
      expect(saved).toEqual([2]);
    });
    scheduler.dispose();
  });
});

describe("PlanningPlayerState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("avoids retired.splice(0) on steady-state frames and still flushes retired states on seed transitions", async () => {
    const { storage, data } = createMemoryStorage();
    let position: [number, number, number] = [5, 20, 10];
    const player = new PlanningPlayerState(
      () => storage,
      () => ({ position, yawDegrees: 0, pitchDegrees: 0, mode: "roam" }),
      () => {}
    );
    const retired = (player as unknown as { retired: SeedWorldPlayerState[] }).retired;
    const spliceSpy = vi.spyOn(retired, "splice");

    player.publish({ seed: 1, width: 100, depth: 100, groundClearance: 3, allowOrbit: false, sampleHeight: () => 1 });
    for (let i = 0; i < 60; i++) {
      player.observe();
    }
    expect(spliceSpy).not.toHaveBeenCalled();

    // Moving and finalizing a new prepared seed retires seed 1's player state; observe() flushes and clears it.
    position = [12, 20, 14];
    const next = player.prepare({
      seed: 2,
      width: 100,
      depth: 100,
      groundClearance: 3,
      allowOrbit: false,
      sampleHeight: () => 1
    });
    next.commit();
    next.finalize();
    expect(retired).toHaveLength(1);
    const retiredState = retired[0]!;
    const disposeSpy = vi.spyOn(retiredState, "dispose");

    player.observe();
    expect(spliceSpy).not.toHaveBeenCalled();
    expect(retired).toHaveLength(0);

    await vi.waitFor(() => {
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
    expect(data.has(seedWorldPlayerStateKey("1"))).toBe(true);
    await player.dispose();
  });
});
