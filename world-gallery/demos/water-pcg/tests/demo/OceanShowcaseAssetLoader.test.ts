import { describe, expect, it } from "vitest";
import {
  settleOceanShowcaseAssetLoads,
  type OceanShowcaseDestroyableAsset
} from "../../demo/ocean/OceanShowcaseAssetLoadSettlement";

class TestAsset
  implements OceanShowcaseDestroyableAsset
{
  destroyCount = 0;

  destroy(): void {
    this.destroyCount++;
  }
}

describe("OceanShowcaseAssetLoader", () => {
  it("returns the parallel asset set without transferring ownership", async () => {
    const pbr = new TestAsset();
    const rock = new TestAsset();
    const foam = new TestAsset();

    await expect(
      settleOceanShowcaseAssetLoads(
        Promise.resolve(pbr),
        Promise.resolve(rock),
        Promise.resolve(foam)
      )
    ).resolves.toEqual({
      pbrTextureLibrary: pbr,
      coastalRockAsset: rock,
      foamDetailTextureLibrary: foam
    });
    expect([
      pbr.destroyCount,
      rock.destroyCount,
      foam.destroyCount
    ]).toEqual([0, 0, 0]);
  });

  it("rolls back every fulfilled sibling when one load rejects", async () => {
    const pbr = new TestAsset();
    const rock = new TestAsset();
    const failure = new Error("foam load failed");

    await expect(
      settleOceanShowcaseAssetLoads(
        Promise.resolve(pbr),
        Promise.resolve(rock),
        Promise.reject(failure)
      )
    ).rejects.toBe(failure);
    expect(pbr.destroyCount).toBe(1);
    expect(rock.destroyCount).toBe(1);
  });

  it("waits for and destroys a sibling that fulfills after an earlier rejection", async () => {
    const rock = new TestAsset();
    const foam = new TestAsset();
    const failure = new Error("pbr load failed");
    let resolveRock:
      | ((asset: TestAsset) => void)
      | undefined;
    const delayedRock = new Promise<TestAsset>(
      (resolve) => {
        resolveRock = resolve;
      }
    );
    const result = settleOceanShowcaseAssetLoads(
      Promise.reject<TestAsset>(failure),
      delayedRock,
      Promise.resolve<TestAsset | undefined>(foam)
    );

    resolveRock?.(rock);
    await expect(result).rejects.toBe(failure);
    expect(rock.destroyCount).toBe(1);
    expect(foam.destroyCount).toBe(1);
  });
});
