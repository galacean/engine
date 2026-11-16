import { PrimitiveMesh } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("rejects oversized meshes without the uint index extension", async () => {
  const { engine } = await createEngine(["OES_element_index_uint"]);
  try {
    expect(() => PrimitiveMesh.createPlane(engine, 1, 1, { widthSegments: 256, depthSegments: 256 })).toThrow(
      "The vertex count is over limit."
    );
  } finally {
    engine.destroy();
  }
});
