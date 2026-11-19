import { expect, test } from "@playwright/test";
import { screenshotWithThreshold } from "../utils/screenshot";

test.describe("Physics", () => {
  test("PhysX compound cart rolls with queryable wheels and a second slider can lock rotation", async ({ page }) => {
    await screenshotWithThreshold(page, {
      category: "Physics",
      name: "physx-compound-rigidbody",
      diffPercentage: 0.002
    });

    const result = await page.evaluate(() => window.compoundRigidbodyResult);
    expect(result.cartX).toBeGreaterThan(-4);
    expect(result.cartY).toBeGreaterThan(0.1);
    expect(result.attachedWheels).toBe(2);
    expect(result.queryableWheels).toBe(2);
    expect(result.frozenBoxX).toBeGreaterThan(5);
    expect(result.frozenBoxRotation).toBeLessThan(1);
    expect(result.freeBoxRotation).toBeGreaterThan(5);
  });

  test("PhysX character controllers climb steps and walkable slopes and stop at tall barriers", async ({ page }) => {
    await screenshotWithThreshold(page, {
      category: "Physics",
      name: "physx-character-controller",
      diffPercentage: 0.002
    });

    const result = await page.evaluate(() => window.characterControllerResult);
    expect(result.stairX).toBeGreaterThan(0);
    expect(result.stairY).toBeGreaterThan(1.3);
    expect(result.hitBarrier).toBe(true);
    expect(result.blockedX).toBeLessThan(-1);
    expect(result.walkableSlopeY).toBeGreaterThan(1.5);
    expect(result.steepSlopeX).toBeGreaterThan(-2);
    expect(result.steepSlopeX).toBeLessThan(0);
    expect(result.steepSlopeY).toBeLessThan(1.2);
  });
});
