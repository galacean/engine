import { describe, expect, it } from "vitest";
import { resolveAssetPath } from "../src/runtime-editor/project/runtime-asset-path";

describe("virtual asset paths across package directories", () => {
  it("resolves a parent-relative resource from the script directory", () => {
    expect(resolveAssetPath("../Models/B.mesh", "Packages/a/src")).toBe("Packages/a/Models/B.mesh");
  });
  it("keeps project-root paths independent of the script directory", () => {
    expect(resolveAssetPath("Models/B.mesh", "Packages/a/src")).toBe("Models/B.mesh");
  });
  it("rejects references escaping the project", () => {
    expect(() => resolveAssetPath("../../B.mesh", "Scripts")).toThrow("escapes the project");
  });
});
