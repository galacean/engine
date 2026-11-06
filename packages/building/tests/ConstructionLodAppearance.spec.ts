import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  constructionLodAppearance,
  constructionLodSurfaceCells
} from "../src/tiny-glade/runtime/ConstructionLodAppearance";
const digest = (x: Uint8Array) => createHash("sha256").update(x).digest("hex");

it("bounds image storage and owns immutable derived bytes", () => {
  const uv = [
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000]
    ],
    cells = [{ id: "a", anchor_uv: [1, 1], size: [1, 1] }];
  const a = constructionLodAppearance(uv, cells),
    saved = a.pixels.slice();
  cells[0].size[0] = 100;
  constructionLodAppearance(uv, cells);
  expect(digest(a.pixels)).toEqual(digest(saved));
  expect(a.width * a.height).toBeLessThanOrEqual(262144);
});
it("projects tilted roof footprints through the actual metric chart", () => {
  const g = {
    vertices: [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 2]
    ],
    uv: [
      [0, 0],
      [4, 0],
      [0, 2]
    ],
    triangles: [[0, 1, 2]]
  };
  const c = {
    id: "a",
    surface_piece: 0,
    anchor_uv: [2, 1],
    size: [1, 1],
    tangent: [1, 0, 0],
    bitangent: [0, Math.SQRT1_2, Math.SQRT1_2]
  };
  const [p] = constructionLodSurfaceCells(g, [c]);
  expect(p.polygon![0][0]).toBeCloseTo(1);
  expect(p.polygon![0][1]).toBeCloseTo(1 - Math.SQRT1_2 / 2);
});
