import { expect, it } from "vitest";
import { constructionGeometry } from "./fixtures/constructionGeometry";

import { woodPillarMesh } from "../src/tiny-glade/assets/decorations/wood-pillar-mesh";

it("decodes the exact GPU wood template instead of an independent structural mesh", () => {
  expect(constructionGeometry.woodPillar.positions).toEqual(woodPillarMesh.positions);
  expect(constructionGeometry.woodPillar.indices).toEqual(woodPillarMesh.indices);
});
