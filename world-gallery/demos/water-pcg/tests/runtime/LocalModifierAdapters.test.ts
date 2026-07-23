import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { RectangularWaterDeformationProvider } from "../../runtime/interaction/RectangularWaterDeformationProvider";
import { RectangularWaterHeightField } from "../../runtime/interaction/RectangularWaterHeightField";
import { RiverStaticLocalModifierResource } from "../../runtime/interaction/RiverStaticLocalModifierResource";
import { createWaterLocalFieldSample } from "../../runtime/interaction/WaterLocalFieldProvider";

describe("local modifier adapters", () => {
  it("keeps the rectangular deformation provider on the solver's exact buffers", () => {
    const field = new RectangularWaterHeightField({
      centerX: 0,
      centerZ: 0,
      lengthAxisX: 1,
      lengthAxisZ: 0,
      length: 8,
      width: 4,
      resolutionX: 17,
      resolutionZ: 9,
      waveSpeed: 3,
      damping: 0.5,
      maxDisplacement: 0.25
    });
    const adapter = new RectangularWaterDeformationProvider(field);
    expect(adapter.heightBuffer).toBe(field.heightCurrent);
    expect(adapter.verticalVelocityBuffer).toBe(field.verticalVelocity);
    field.registerInteraction(new Vector3(), new Vector3(0, 1, 0), new Vector3(0, -5, 0), 0.7, 0.2, true);
    field.step(1 / 60);
    const sample = createWaterLocalFieldSample();
    expect(adapter.sampleLocalField(0, 0, sample)).toBe(true);
    expect(sample.displacementY).toBeLessThan(0);
    expect(sample.surfaceVelocityY).toBe(
      field.verticalVelocity[(field.resolutionZ >> 1) * field.resolutionX + (field.resolutionX >> 1)]
    );
  });

  it("creates static River tile modifiers over one shared RGBA buffer", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const atlas = data.terrainInteraction.localMapAtlas!;
    const resource = new RiverStaticLocalModifierResource(atlas);
    const bindings = resource.createBindings("river");
    const tile = atlas.tiles[0];
    const sample = createWaterLocalFieldSample();

    expect(resource.pixelBuffer).toHaveLength(atlas.width * atlas.height * 4);
    expect(resource.tileProviders).toHaveLength(atlas.tiles.length);
    expect(bindings).toHaveLength(atlas.tiles.length);
    expect(bindings[0].provider).toBe(resource.tileProviders[0]);
    expect(
      bindings[0].provider.sampleLocalField(
        (tile.min[0] + tile.max[0]) * 0.5,
        (tile.min[1] + tile.max[1]) * 0.5,
        sample
      )
    ).toBe(true);
    expect(Number.isFinite(sample.currentLargeX)).toBe(true);
    expect(Number.isFinite(sample.currentLargeZ)).toBe(true);
    expect(sample.foamSource).toBeGreaterThanOrEqual(0);
    expect(sample.foamSource).toBeLessThanOrEqual(1);
  });
});
