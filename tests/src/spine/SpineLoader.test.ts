import { describe, expect, it, vi } from "vitest";
import { AssetPromise, AssetType, ResourceManager } from "@galacean/engine";
import { SpineLoader } from "../../../packages/spine/src/loader/SpineLoader";

describe("Spine loader routing", () => {
  it.each([
    { url: "asset.skel", type: undefined, expectedType: "Spine" },
    { url: "asset.json", type: undefined, expectedType: AssetType.JSON },
    { url: "asset.bin", type: undefined, expectedType: AssetType.Buffer },
    { url: "asset.json", type: "Spine", expectedType: "Spine" },
    { url: "asset.bin", type: "Spine", expectedType: "Spine" }
  ])("routes $url with type $type to $expectedType", async ({ url, type, expectedType }) => {
    const resourceManager = new ResourceManager(null);
    const resource = {};
    const load = vi.spyOn(ResourceManager._loaders[expectedType], "load").mockImplementation(() => {
      return AssetPromise.resolve(resource);
    });
    try {
      expect(await resourceManager.load({ url, type })).to.equal(resource);
      expect(load).toHaveBeenCalledOnce();
    } finally {
      load.mockRestore();
    }
  });
});

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

import { readSpineVersion } from "../../../packages/spine/src/loader/SpineVersion";
import { LoaderUtils } from "../../../packages/spine/src/loader/LoaderUtils";

describe("Spine export headers", () => {
  function string(value: string) {
    const bytes = Array.from(new TextEncoder().encode(value));
    return [bytes.length + 1, ...bytes];
  }
  it("reads JSON version metadata", () => {
    expect(readSpineVersion(' \n {"skeleton":{"spine":"3.8.99"}}')).to.equal("3.8.99");
    expect(readSpineVersion('{"skeleton":{"spine":"4.2.40"}}')).to.equal("4.2.40");
  });
  it("distinguishes the binary hash layouts before invoking a parser", () => {
    expect(readSpineVersion(new Uint8Array([...string("hash"), ...string("3.8.99")]).buffer)).to.equal("3.8.99");
    expect(readSpineVersion(new Uint8Array([...Array(8).fill(0), ...string("4.2.40")]).buffer)).to.equal("4.2.40");
  });
  it("rejects missing versions and truncated binary headers", () => {
    expect(() => readSpineVersion("{}")).to.throw(/export version/);
    expect(() => readSpineVersion(new Uint8Array([128]).buffer)).to.throw(/invalid or ambiguous/);
    expect(() => readSpineVersion(new Uint8Array([...Array(8).fill(0), 100, 52]).buffer)).to.throw();
  });
  it("reads page names without loading any backend", () => {
    expect(
      LoaderUtils.readAtlasPageNames("\npage.png\nsize: 4,4\nregion\n  bounds: 0,0,4,4\n\nother.png\nsize: 4,4\n")
    ).to.deep.equal(["page.png", "other.png"]);
  });
});
