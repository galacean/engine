import { describe, expect, it } from "vitest";
import {
  WaterLocalModifierChannel,
  createWaterLocalFieldSample,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "../../runtime/interaction/WaterLocalFieldProvider";
import { WaterLocalFieldComposer } from "../../runtime/interaction/WaterLocalFieldComposer";
import { WaterLocalModifierBlendMode } from "../../runtime/interaction/WaterLocalModifier";

function provider(channels: number, values: Partial<WaterLocalFieldSample>): WaterLocalFieldProvider {
  return {
    channels,
    sampleLocalField(_worldX, _worldZ, out): boolean {
      Object.assign(out, values);
      return true;
    }
  };
}

function modifier(id: string, channels: number, priority: number, blendMode: WaterLocalModifierBlendMode) {
  return {
    id,
    bodyId: "pool",
    bounds: { minX: -2, minZ: -2, maxX: 2, maxZ: 2 },
    channels,
    priority,
    blendMode,
    dynamic: false
  } as const;
}

describe("WaterLocalFieldComposer", () => {
  it("composes channel-specific add, max, and priority-ordered override rules", () => {
    const composer = new WaterLocalFieldComposer("pool");
    composer.register(
      modifier("foam-add", WaterLocalModifierChannel.FoamSource, 0, WaterLocalModifierBlendMode.Add),
      provider(WaterLocalModifierChannel.FoamSource, { foamSource: 0.7 })
    );
    composer.register(
      modifier("foam-max", WaterLocalModifierChannel.FoamSource, 1, WaterLocalModifierBlendMode.Max),
      provider(WaterLocalModifierChannel.FoamSource, { foamSource: 0.9 })
    );
    composer.register(
      modifier("current-low", WaterLocalModifierChannel.CurrentLarge, 2, WaterLocalModifierBlendMode.Override),
      provider(WaterLocalModifierChannel.CurrentLarge, { currentLargeX: 1, currentLargeZ: 0 })
    );
    composer.register(
      modifier("current-high", WaterLocalModifierChannel.CurrentLarge, 3, WaterLocalModifierBlendMode.Override),
      provider(WaterLocalModifierChannel.CurrentLarge, { currentLargeX: 0, currentLargeZ: 2 })
    );
    const sample = createWaterLocalFieldSample();

    expect(composer.sampleLocalField(0, 0, sample)).toBe(true);
    expect(sample.foamSource).toBeCloseTo(0.9);
    expect(sample.currentLargeX).toBe(0);
    expect(sample.currentLargeZ).toBe(2);
    expect(composer.sampleLocalField(5, 5, sample)).toBe(false);
    expect(sample.foamSource).toBe(0);
  });

  it("rejects duplicate ids, body mismatches, and unsupported channels", () => {
    const composer = new WaterLocalFieldComposer("pool");
    const foamProvider = provider(WaterLocalModifierChannel.FoamSource, { foamSource: 1 });
    const foamModifier = modifier("foam", WaterLocalModifierChannel.FoamSource, 0, WaterLocalModifierBlendMode.Max);
    composer.register(foamModifier, foamProvider);
    expect(() => composer.register(foamModifier, foamProvider)).toThrow(/already registered/);
    expect(() => composer.register({ ...foamModifier, id: "other-body", bodyId: "river" }, foamProvider)).toThrow(
      /different body/
    );
    expect(() =>
      composer.register(
        { ...foamModifier, id: "wrong-channel", channels: WaterLocalModifierChannel.CurrentLarge },
        foamProvider
      )
    ).toThrow(/does not expose/);
    expect(composer.unregister("foam")).toBe(true);
    expect(composer.modifierCount).toBe(0);
  });
});
