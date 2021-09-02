import { Color } from "@oasis-engine/math";
import { PBRMaterial } from "../../../core/src/material/PBRMaterial";
import { PBRSpecularMaterial } from "../../../core/src/material/PBRSpecularMaterial";
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import "../../src/gltf/extensions/KHR_materials_pbrSpecularGlossiness";
import { GLTFParser } from "../../src/gltf/GLTFParser";
import { GLTFResource } from "../../src/gltf/GLTFResource";
import { AnimationParser } from "../../src/gltf/parser/AnimationParser";
import { EntityParser } from "../../src/gltf/parser/EntityParser";
import { MaterialParser } from "../../src/gltf/parser/MaterialParser";
import { MeshParser } from "../../src/gltf/parser/MeshParser";
import { SceneParser } from "../../src/gltf/parser/SceneParser";
import { SkinParser } from "../../src/gltf/parser/SkinParser";
import { Validator } from "../../src/gltf/parser/Validator";
import "../../src/GLTFLoader";
import gltfJson from "./test.json";

describe("AnimationClipLoader Test", () => {
  it("parser", async () => {
    const engine = new WebGLEngine(document.createElement("canvas"));
    const resource = new GLTFResource(engine);
    resource.gltf = gltfJson as any;
    resource.buffers = [new ArrayBuffer(100)];
    resource.textures = [];

    // @ts-ignore
    const parser = new GLTFParser([
      Validator,
      MaterialParser,
      MeshParser,
      EntityParser,
      SkinParser,
      AnimationParser,
      SceneParser
    ]);

    await parser.parse(resource);

    // entites
    expect(resource.entities.length).toEqual(1);

    // materials
    const { materials } = resource;
    expect(materials.length).toEqual(2);
    // @ts-ignore
    const material = <PBRMaterial>materials[0];
    expect(material.name).toEqual("AnimatedCube");
    expect(typeof material.baseTexture === "undefined").toEqual(true);
    expect(Color.equals(material.baseColor, new Color(1, 0, 0, 1))).toEqual(true);
    expect(material.isTransparent).toEqual(true);
    expect(material.renderFace).toEqual(2);
    // @ts-ignore
    const specularMaterial = <PBRSpecularMaterial>materials[1];
    expect(specularMaterial.name).toEqual("2256_Avocado_d");
    expect(typeof specularMaterial.baseTexture !== "undefined").toEqual(false);
    expect(Color.equals(specularMaterial.baseColor, new Color(1, 1, 1, 1))).toEqual(true);
    expect(specularMaterial.isTransparent).toEqual(false);
    expect(specularMaterial.renderFace).toEqual(0);

    // meshes
    const modleMesh = resource.meshes[0][0];
    expect(modleMesh.name === "AnimatedCube").toEqual(true);

    // skin
    expect(resource.skins === undefined).toEqual(true);

    // animation
    const { animations } = resource;
    expect(animations.length === 1).toEqual(true);
    const animation = animations[0];
    expect(animation.name === "animation_AnimatedCube").toEqual(true);
    expect(animation.curveBindings.length).toEqual(1);
  });
});
