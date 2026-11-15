import { describe, expect, it } from "vitest";

describe("@galacean/engine pure-Node import", () => {
  it("loads the umbrella package without browser globals and keeps core registrations", async () => {
    expect(typeof window).toBe("undefined");

    const { Engine, Loader, Transform } = await import("../src/index");

    expect(Loader.getClass("Transform")).toBe(Transform);
    expect(Loader.getClassName(Transform)).toBe("Transform");
    expect(Engine._builtinShaders).toBeDefined();
    expect(Object.keys(Engine._builtinShaders).length).toBeGreaterThan(0);
  });
});
