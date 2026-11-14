import { describe, expect, it, vi } from "vitest";
import { planAnimalStaticRoute } from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";
import type { AnimalRoutePoint } from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";

describe("animal route graph capacity", () => {
  it("continues searching existing edges after the waypoint capacity is reached", () => {
    const obstruction = vi.fn(() => ({
      key: "large obstacle",
      corners: Array.from({ length: 48 }, (_, i) => [i + 1, 0] as const)
    }));
    const canTraverse = vi.fn(
      (a: AnimalRoutePoint, b: AnimalRoutePoint) =>
        a[0] === b[0] || (a[0] === 0 && b[0] === 48) || (a[0] === 48 && b[0] === 100)
    );
    expect(planAnimalStaticRoute([0, 0], [100, 0], { canTraverse, obstruction })).toEqual([
      [48, 0],
      [100, 0]
    ]);
    expect(obstruction).toHaveBeenCalledTimes(1);
    expect(canTraverse).toHaveBeenCalledWith([0, 0], [47, 0], 0);
  });

  it.each([true, false])("retains terminal edge validation at the obstacle limit (clear: %s)", (clear) => {
    const obstruction = vi.fn((_a: AnimalRoutePoint, b: AnimalRoutePoint) => {
      const key = b[0] === 100 ? 0 : b[0];
      return { key, corners: [[key + 1, 0] as const] };
    });
    const canTraverse = vi.fn(
      (a: AnimalRoutePoint, b: AnimalRoutePoint) =>
        a[0] === b[0] || (a[0] === 0 && b[0] === 12) || (clear && a[0] === 12 && b[0] === 100)
    );
    expect(planAnimalStaticRoute([0, 0], [100, 0], { canTraverse, obstruction }, 3)).toEqual(
      clear
        ? [
            [12, 0],
            [100, 0]
          ]
        : undefined
    );
    expect(obstruction).toHaveBeenCalledTimes(12);
    expect(canTraverse).toHaveBeenCalledWith([12, 0], [100, 0], 0);
    expect(canTraverse).toHaveBeenCalledWith([12, 0], [11, 0], 3);
  });
});
