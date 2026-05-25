import { describe, expect, it } from "vitest";

describe("GLTFSkinParser rootBone resolution", () => {
  async function createParser(): Promise<any> {
    (globalThis as any).window = { AudioContext: undefined, TextMetrics: undefined };
    const { GLTFSkinParser } = await import("./GLTFSkinParser");
    return new GLTFSkinParser();
  }

  it("includes skinned mesh nodes when resolving missing skin.skeleton", async () => {
    const parser = await createParser();
    const sceneRoot = { name: "GLTF_ROOT" };
    const meshRoot = { name: "Character_Man", parent: sceneRoot };
    const hips = { name: "mixamorig:Hips", parent: sceneRoot };
    const spine = { name: "mixamorig:Spine", parent: hips };

    const rootBone = (parser as any)._findSkinRootBoneByLCA(
      0,
      [1, 2],
      [meshRoot, hips, spine],
      [{ name: "Character_Man", skin: 0 }, { name: "mixamorig:Hips" }, { name: "mixamorig:Spine" }]
    );

    expect(rootBone).toBe(sceneRoot);
  });

  it("does not promote to the scene wrapper for unrelated top-level siblings", async () => {
    const parser = await createParser();
    const sceneRoot = { name: "GLTF_ROOT" };
    const characterRoot = { name: "Character_Root", parent: sceneRoot };
    const mesh = { name: "Character_Mesh", parent: characterRoot };
    const hips = { name: "mixamorig:Hips", parent: characterRoot };
    const light = { name: "Light", parent: sceneRoot };

    const rootBone = (parser as any)._findSkinRootBoneByLCA(
      0,
      [3],
      [characterRoot, mesh, light, hips],
      [{ name: "Character_Root" }, { name: "Character_Mesh", skin: 0 }, { name: "Light" }, { name: "mixamorig:Hips" }]
    );

    expect(rootBone).toBe(characterRoot);
  });
});
