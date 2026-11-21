import { describe, expect, it } from "vitest";
import { LoaderUtils } from "../../../packages/spine/src/loader/LoaderUtils";

describe("LoaderUtils.getBaseUrl", () => {
  it("strips the file name from a local path", () => {
    expect(LoaderUtils.getBaseUrl("/assets/spine/data.json")).to.equal("/assets/spine/");
  });

  it("returns empty string for a bare file name", () => {
    expect(LoaderUtils.getBaseUrl("data.json")).to.equal("");
  });

  it("strips the file name from an http url", () => {
    expect(LoaderUtils.getBaseUrl("https://cdn.example.com/a/b/data.json")).to.equal("https://cdn.example.com/a/b/");
  });
});
