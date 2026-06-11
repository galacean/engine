import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("GLTFSkinParser rootBone resolution", () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = { AudioContext: undefined, TextMetrics: undefined };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  async function createParser(): Promise<any> {
    const { GLTFSkinParser } = await import("../src/gltf/parser/GLTFSkinParser");
    return new GLTFSkinParser();
  }

  it("ignores skinned mesh nodes when resolving missing skin.skeleton", async () => {
    const parser = await createParser();
    const sceneRoot = { name: "GLTF_ROOT" };
    const meshRoot = { name: "Character_Man", parent: sceneRoot };
    const hips = { name: "mixamorig:Hips", parent: sceneRoot };
    const spine = { name: "mixamorig:Spine", parent: hips };

    const rootBone = (parser as any)._findSkinRootBoneByLCA([1, 2], [meshRoot, hips, spine]);

    expect(rootBone).toBe(hips);
  });

  it("does not promote to the scene wrapper for unrelated top-level siblings", async () => {
    const parser = await createParser();
    const sceneRoot = { name: "GLTF_ROOT" };
    const characterRoot = { name: "Character_Root", parent: sceneRoot };
    const mesh = { name: "Character_Mesh", parent: characterRoot };
    const hips = { name: "mixamorig:Hips", parent: characterRoot };
    const light = { name: "Light", parent: sceneRoot };

    const rootBone = (parser as any)._findSkinRootBoneByLCA([0, 3], [characterRoot, mesh, light, hips]);

    expect(rootBone).toBe(characterRoot);
  });
});
