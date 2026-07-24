import type { Texture2D } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import {
  createOceanNearshoreStaticBinding,
  OceanNearshoreDebugView
} from "../../runtime/ocean/OceanNearshoreShaderTypes";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

describe("OceanNearshoreShaderTypes", () => {
  it("binds the exact compiler decode and explicit edge policy without owning the texture", () => {
    const compiled = OceanNearshoreCompiler.compile(createOceanNearshoreFixture());
    if (!compiled.valid || !compiled.data) throw new Error("Fixture did not compile.");
    const resource = OceanNearshoreFieldResource.create(compiled.data);
    const texture = { width: 5, height: 5 } as Texture2D;
    const binding = createOceanNearshoreStaticBinding(
      resource,
      texture,
      OceanNearshoreDebugView.ShoreDistance
    );

    expect(binding.texture).toBe(texture);
    expect(binding.worldToUv).toBe(compiled.data.staticAtlas.worldToUv);
    expect(binding.decode).toEqual([
      compiled.data.staticAtlas.currentDecodeScale,
      compiled.data.staticAtlas.maximumDepth,
      compiled.data.staticAtlas.shoreDistanceRange,
      128.5 / 255
    ]);
    expect(binding.outsidePolicy).toEqual([1, 1, 1, 0]);
    expect(binding.debugView).toBe(OceanNearshoreDebugView.ShoreDistance);
    expect(Object.isFrozen(binding)).toBe(true);

    resource.dispose();
  });
});
