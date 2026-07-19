import { describe, expect, it } from "vitest";
import { SpineLoader } from "../../../packages/spine/src/loader/SpineLoader";

describe("SpineLoader._getUrlExtension", () => {
  it("extracts the extension for spine asset types", () => {
    expect(SpineLoader._getUrlExtension("path/to/spine.json")).to.equal("json");
    expect(SpineLoader._getUrlExtension("path/to/spine.skel")).to.equal("skel");
    expect(SpineLoader._getUrlExtension("path/to/spine.atlas")).to.equal("atlas");
  });

  it("ignores query strings", () => {
    expect(SpineLoader._getUrlExtension("spine.json?v=2")).to.equal("json");
  });

  it("returns null when there is no extension", () => {
    expect(SpineLoader._getUrlExtension("spine")).to.be.null;
  });
});
