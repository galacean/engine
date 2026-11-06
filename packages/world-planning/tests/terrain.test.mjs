import { test } from "vitest";
import assert from "node:assert/strict";
import { masonryTerrainSource } from "../src/masonry/MasonryPlacement.ts";
import { sampleSeedWorldHeight } from "../src/runtime/SeedWorldFields.ts";
import { constructionTerrainHeight } from "@galacean/engine-building/tiny-glade/runtime/TerrainField.ts";

test("adapter detaches canonical final R16 and matches Seed sampling at edges and interior", () => {
  for (const custom of [false, true]) {
    const fields = {
      sizeMetres: 48,
      heightResolution: 5,
      heightSamples: Uint16Array.from({ length: 25 }, (_, i) => (i * 2351) % 65536),
      ...(custom ? { worldOrigin: [123, -27], heightDecode: { offset: 17, scale: 91 } } : {})
    };
    const source = masonryTerrainSource({
      revision: 12,
      data: { fields },
      heightTransition: { fields: { heightSamples: new Uint16Array(25) } }
    });
    assert.equal(source.revision, 12);
    assert.notEqual(source.grid.samples.buffer, fields.heightSamples.buffer);
    for (let iz = 0; iz <= 16; iz++)
      for (let ix = 0; ix <= 16; ix++) {
        const x = source.grid.origin[0] + (ix / 16) * 48,
          z = source.grid.origin[1] + (iz / 16) * 48;
        assert.equal(constructionTerrainHeight(source.grid, x, z), sampleSeedWorldHeight(fields, x, z));
      }
    const previous = source.grid.samples[0];
    fields.heightSamples[0] = 65535;
    assert.equal(source.grid.samples[0], previous);
    assert.equal(sampleSeedWorldHeight(fields, source.grid.origin[0] - 1, source.grid.origin[1]), undefined);
    assert.throws(
      () => constructionTerrainHeight(source.grid, source.grid.origin[0] - 1, source.grid.origin[1]),
      /outside/
    );
  }
});
