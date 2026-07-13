import { describe, expect, it } from "vitest";
import { SpineVertexStride } from "../../../packages/spine/src/SpineConstant";
import { SpineBlendMode } from "../../../packages/spine/src/enums/SpineBlendMode";

describe("SpineVertexStride", () => {
  it("is 9 floats without tint and 12 with tint black", () => {
    // [x,y,z,u,v,r,g,b,a] vs [...,dr,dg,db] — must match the renderer's vertex layout.
    expect(SpineVertexStride.withoutTint).to.equal(9);
    expect(SpineVertexStride.withTint).to.equal(12);
  });
});

describe("SpineBlendMode", () => {
  it("ordinals match the spine-core BlendMode order", () => {
    expect(SpineBlendMode.Normal).to.equal(0);
    expect(SpineBlendMode.Additive).to.equal(1);
    expect(SpineBlendMode.Multiply).to.equal(2);
    expect(SpineBlendMode.Screen).to.equal(3);
  });
});
