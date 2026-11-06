import { constructionGeometry } from "./fixtures/constructionGeometry";
import { describe, expect, it } from "vitest";
import { constructionDecorationType } from "../src/tiny-glade/runtime/ConstructionDecorationCatalog";
describe("Cottage native blueprint to shared roof/decoration render data", () => {
  it("publishes suggested unfolded sizes for the connected public producer", () => {
    const info = constructionDecorationType(constructionGeometry.decorations, "dormer-cottage")!;
    expect(info.implemented).toBe(true);
    expect(info.dimensions.map((d) => d.rank)).toEqual([1, 2, 3]);
    [0.8, 1.55, 2.2666667].forEach((size, i) => expect(info.dimensions[i].width).toBeCloseTo(size, 6));
  });
});
