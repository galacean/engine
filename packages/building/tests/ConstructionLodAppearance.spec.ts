import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { constructionLodAppearance } from "../src/building/runtime/ConstructionLodAppearance";
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
