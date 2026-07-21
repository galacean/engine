import { describe, expect, it } from "vitest";
import { RiverNetworkSchemaVersion, RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { WaterDecorationStyle } from "../../demo/decoration/constants";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";

describe("multi-tributary river example", () => {
  it("keeps one Y-shaped confluence and reuses the high-difference river water presentation", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const referenceDescriptor = curvedMainRiverExample.riverDescriptor;
    if (
      descriptor.schemaVersion !== RiverNetworkSchemaVersion.V2 ||
      referenceDescriptor.schemaVersion !== RiverNetworkSchemaVersion.V2
    ) {
      throw new Error("Expected both river examples to use the V2 surface-motion contract.");
    }

    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats).toMatchObject({ nodeCount: 4, reachCount: 3, sourceCount: 2, junctionCount: 1 });
    expect(descriptor.nodes.filter((node) => node.kind === RiverNodeKind.Confluence)).toHaveLength(1);
    expect(descriptor.defaults.material).toEqual(referenceDescriptor.defaults.material);
    expect(descriptor.defaults.surfaceMotion).toEqual(referenceDescriptor.defaults.surfaceMotion);
    expect(multiTributaryRiverExample.decorationStyle).toBe(WaterDecorationStyle.HeightfieldRiver);
    expect(multiTributaryRiverExample.decorationStyle).toBe(curvedMainRiverExample.decorationStyle);
  });
});
