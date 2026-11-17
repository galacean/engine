import {
  AssetType,
  Camera,
  DirectLight,
  GLTFResource,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  RenderFace,
  RenderTarget,
  Shader,
  Skin,
  SkinnedMeshRenderer,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("PBR anisotropy", () => {
  let engine: WebGLEngine;
  let material: PBRMaterial;
  let texture: Texture2D;
  let output: Texture2D;
  let shader: Shader;
  let mesh: ModelMesh;
  let renderer: MeshRenderer;
  let camera: Camera;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler()
    });

    // Read the production surface direction directly, independently of lighting and SSR.
    shader = Shader.create(`Shader "PBRAnisotropyDirection" {
      SubShader "Default" { Pass "Forward" {
        CullMode rasterStateCullMode;
        RasterState = { CullMode = rasterStateCullMode; };
        VertexShader = PBRVertex;
        FragmentShader = inspectAnisotropy;
        #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
        vec4 inspectAnisotropy(Varyings v) {
          SurfaceData surface = getSurfaceData(v, v.uv, gl_FrontFacing);
          #ifdef INSPECT_ANISOTROPY_FRAME
            return vec4(vec3(length(surface.anisotropicT), length(surface.anisotropicB), length(surface.normal)) * 0.5,
              max(abs(dot(surface.normal, surface.anisotropicT)),
                max(abs(dot(surface.normal, surface.anisotropicB)), abs(dot(surface.anisotropicT, surface.anisotropicB)))));
          #endif
          #ifdef INSPECT_SURFACE_NORMAL
            vec3 direction = surface.normal;
          #elif defined(INSPECT_CLEAR_COAT_NORMAL) && defined(MATERIAL_ENABLE_CLEAR_COAT)
            vec3 direction = surface.clearCoatNormal;
          #else
            vec3 direction = surface.anisotropicT;
          #endif
          float strength = 0.0;
          #ifdef MATERIAL_ENABLE_ANISOTROPY
            strength = surface.anisotropy;
          #endif
          return vec4(direction * 0.5 + 0.5, strength);
        }
      } }
    }`);
    const root = engine.sceneManager.activeScene!.createRootEntity();
    camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    // A linear render target avoids the canvas's final sRGB conversion.
    output = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8, false, false);
    camera.renderTarget = new RenderTarget(engine, 16, 16, output);
    renderer = root.createChild().addComponent(MeshRenderer);
    material = new PBRMaterial(engine);
    material.shader = shader;
    renderer.setMaterial(material);
    texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
  });

  beforeEach(() => {
    // Each case owns its vertex layout; adding/removing tangents must not affect another case.
    mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 1, 0)]);
    mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
    mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5, 1)]);
    mesh.setIndices(new Uint16Array([0, 1, 2]));
    mesh.addSubMesh(0, 3);
    mesh.bounds.min.set(-1, -1, 0);
    mesh.bounds.max.set(1, 1, 0);
    renderer.mesh = mesh;
    renderer.entity.transform.setScale(1, 1, 1);
    renderer.entity.transform.setRotation(0, 0, 0);
    material.anisotropy = 0.8;
    material.anisotropyRotation = 0;
    material.anisotropyTexture = null!;
    material.normalTexture = null!;
    material.normalTextureIntensity = 1;
    material.clearCoat = 0;
    material.clearCoatNormalTexture = null!;
    material.renderFace = RenderFace.Front;
    material.shaderData.disableMacro("INSPECT_SURFACE_NORMAL");
    material.shaderData.disableMacro("INSPECT_CLEAR_COAT_NORMAL");
    material.shaderData.disableMacro("INSPECT_ANISOTROPY_FRAME");
    camera.isOrthographic = false;
    camera.entity.transform.setPosition(0, 0, 3);
  });

  afterEach(() => {
    renderer.mesh = null!;
    mesh.destroy();
  });

  afterAll(() => {
    engine?.destroy();
    shader?.destroy();
  });

  function expectDirectionAndStrength(direction: Vector3, strength: number): void {
    mesh.uploadData(false);
    engine.update();
    const pixel = new Uint8Array(4);
    output.getPixelBuffer(8, 8, 1, 1, pixel);
    const expected = [
      (direction.x * 0.5 + 0.5) * 255,
      (direction.y * 0.5 + 0.5) * 255,
      (direction.z * 0.5 + 0.5) * 255,
      strength * 255
    ];
    const channels = ["R (direction X)", "G (direction Y)", "B (direction Z)", "A (strength)"];
    pixel.forEach((value, channel) => {
      expect(
        Math.abs(value - expected[channel]),
        `${channels[channel]}: expected ${expected[channel].toFixed(2)}, received ${value}`
      ).toBeLessThanOrEqual(2);
    });
  }

  it.each([
    [0, 128, 255],
    [0, 255, 128],
    [45, 128, 255],
    [45, 0, 128],
    [90, 128, 255]
  ])("rotates texture directions on the GPU (rotation %i; RG %i, %i)", (rotation, r, g) => {
    material.anisotropyTexture = texture;
    material.anisotropyRotation = rotation;
    texture.setPixelBuffer(new Uint8Array([r, g, 128, 255]));
    const direction = Math.atan2((2 * g) / 255 - 1, (2 * r) / 255 - 1) + (rotation * Math.PI) / 180;
    expectDirectionAndStrength(new Vector3(Math.cos(direction), Math.sin(direction), 0), (0.8 * 128) / 255);
  });

  it("preserves rotation and strength without a direction texture", () => {
    material.anisotropyTexture = null!;
    material.anisotropyRotation = 90;
    expectDirectionAndStrength(new Vector3(0, 1, 0), 0.8);
  });

  it.each([
    ...[0, 45, 90].flatMap((rotation) =>
      [1, -1].flatMap((sign) =>
        [false, true].map((backFace) => ({ rotation, sign, backFace, parallel: false, withTangents: true }))
      )
    ),
    ...[1, -1].map((sign) => ({ rotation: 0, sign, backFace: false, parallel: true, withTangents: true })),
    ...[false, true].map((backFace) => ({ rotation: 45, sign: 1, backFace, parallel: false, withTangents: false }))
  ])(
    "keeps the final shading frame orthonormal (rotation $rotation; sign $sign; back $backFace; parallel $parallel; tangents $withTangents)",
    ({ rotation, sign, backFace, parallel, withTangents }) => {
      if (withTangents) mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, sign)));
      const normalMap = new Texture2D(engine, 2, 1, TextureFormat.R8G8B8A8, false, false);
      try {
        normalMap.filterMode = TextureFilterMode.Bilinear;
        // At UV (0.5,0.5), filtering gives exactly (1,0.5,0.5), hence N=+X.
        normalMap.setPixelBuffer(
          new Uint8Array(parallel ? [255, 127, 127, 255, 255, 128, 128, 255] : [218, 128, 218, 255, 218, 128, 218, 255])
        );
        material.normalTexture = normalMap;
        material.anisotropyRotation = rotation;
        material.renderFace = RenderFace.Double;
        material.shaderData.enableMacro("INSPECT_ANISOTROPY_FRAME");
        renderer.entity.transform.setRotation(0, backFace ? 180 : 0, 0);
        camera.isOrthographic = true;
        camera.orthographicSize = 2;
        camera.entity.transform.setPosition(-1 / 8, 1 / 8, 3);
        mesh.uploadData(false);
        engine.update();
        const pixel = new Uint8Array(4);
        output.getPixelBuffer(8, 8, 1, 1, pixel);
        // A BRDF frame has three unit axes and zero pairwise dot products.
        pixel.slice(0, 3).forEach((length) => expect(Math.abs(length - 127.5)).toBeLessThanOrEqual(2));
        expect(pixel[3]).toBeLessThanOrEqual(2);
      } finally {
        material.normalTexture = null!;
        normalMap.destroy();
      }
    }
  );

  function withProductionPBR(check: (pbr: PBRMaterial, read: () => number[]) => void): void {
    const scene = engine.sceneManager.activeScene!;
    const diffuseIntensity = scene.ambientLight.diffuseIntensity;
    const lightEntity = scene.createRootEntity();
    lightEntity.addComponent(DirectLight).color.set(0.1, 0.1, 0.1, 1);
    const pbr = new PBRMaterial(engine);
    pbr.metallic = 1;
    pbr.roughness = 0.8;
    renderer.setMaterial(pbr);
    scene.ambientLight.diffuseIntensity = 0;
    camera.isOrthographic = true;
    camera.orthographicSize = 2;
    camera.entity.transform.setPosition(-1 / 8, 1 / 8, 3);
    mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, 1)));
    mesh.uploadData(false);
    try {
      check(pbr, () => {
        engine.update();
        const pixel = new Uint8Array(4);
        output.getPixelBuffer(8, 8, 1, 1, pixel);
        return Array.from(pixel.slice(0, 3));
      });
    } finally {
      renderer.setMaterial(material);
      pbr.destroy();
      lightEntity.destroy();
      scene.ambientLight.diffuseIntensity = diffuseIntensity;
    }
  }

  it.each([false, true])("matches isotropic PBR when texture strength is zero (tilted normal %s)", (tilted) => {
    const directionMap = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
    try {
      directionMap.setPixelBuffer(new Uint8Array([255, 128, 0, 255]));
      texture.setPixelBuffer(new Uint8Array(tilted ? [218, 128, 218, 255] : [128, 128, 255, 255]));
      withProductionPBR((pbr, read) => {
        pbr.normalTexture = texture;
        pbr.anisotropyTexture = directionMap;
        const reference = read();
        expect(reference[0]).toBeGreaterThan(5);
        expect(reference[0]).toBeLessThan(250);
        pbr.anisotropy = 0.8;
        for (const rotation of [0, 45, 90]) {
          pbr.anisotropyRotation = rotation;
          read().forEach((value, channel) => expect(Math.abs(value - reference[channel])).toBeLessThanOrEqual(1));
        }
      });
    } finally {
      directionMap.destroy();
    }
  });

  it.each([0, 255])("keeps production PBR finite when filtering cancels directions (blue %i)", (blue) => {
    const directionMap = new Texture2D(engine, 2, 1, TextureFormat.R8G8B8A8, false, false);
    try {
      directionMap.filterMode = TextureFilterMode.Bilinear;
      directionMap.setPixelBuffer(new Uint8Array([255, 255, blue, 255, 0, 0, blue, 255]));
      withProductionPBR((pbr, read) => {
        pbr.anisotropy = 0.8;
        pbr.anisotropyRotation = 45;
        pbr.anisotropyTexture = directionMap;
        // With V and L along N, rotating a valid tangent frame cannot change this highlight.
        const samples = [-0.02, 0, 0.02].map((x) => {
          camera.entity.transform.setPosition(-1 / 8 + x, 1 / 8, 3);
          return read();
        });
        expect(samples[0][0]).toBeGreaterThan(5);
        expect(samples[0][0]).toBeLessThan(250);
        samples.slice(1).forEach((pixel) => {
          pixel.forEach((value, channel) => expect(Math.abs(value - samples[0][channel])).toBeLessThanOrEqual(1));
        });
      });
    } finally {
      directionMap.destroy();
    }
  });

  it.each([0, 255])("keeps the clearcoat lobe independent of base anisotropy (blue %i)", (blue) => {
    const directionMap = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
    try {
      directionMap.setPixelBuffer(new Uint8Array([255, 128, blue, 255]));
      texture.setPixelBuffer(new Uint8Array([218, 128, 218, 255]));
      withProductionPBR((pbr, read) => {
        // A black metal base contributes no radiance in this head-on light/view configuration.
        pbr.baseColor.set(0, 0, 0, 1);
        pbr.normalTexture = texture;
        pbr.clearCoat = 1;
        pbr.clearCoatRoughness = 0.25;
        pbr.anisotropyTexture = directionMap;
        const reference = read();
        expect(reference[0]).toBeGreaterThan(2);
        expect(reference[0]).toBeLessThan(250);
        pbr.anisotropy = 0.8;
        for (const rotation of [0, 45, 90]) {
          pbr.anisotropyRotation = rotation;
          read().forEach((value, channel) => expect(Math.abs(value - reference[channel])).toBeLessThanOrEqual(1));
        }
      });
    } finally {
      directionMap.destroy();
    }
  });

  it("uses the clearcoat normal for environment reflection with base anisotropy", () => {
    const environment = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false, false);
    const ambient = engine.sceneManager.activeScene!.ambientLight;
    const previous = ambient.specularTexture;
    try {
      for (let face = 0; face < 6; face++) {
        const value = face === TextureCubeFace.PositiveZ ? 255 : 0;
        environment.setPixelBuffer(face, new Uint8Array([value, value, value, 255]));
      }
      ambient.specularTexture = environment;
      texture.setPixelBuffer(new Uint8Array([255, 128, 191, 255]));
      withProductionPBR((pbr, read) => {
        pbr.baseColor.set(0, 0, 0, 1);
        pbr.normalTexture = texture;
        pbr.clearCoat = 1;
        pbr.clearCoatRoughness = 0.25;
        const reference = read();
        expect(reference[0]).toBeGreaterThan(5);
        expect(reference[0]).toBeLessThan(250);
        pbr.anisotropy = 0.8;
        for (const rotation of [0, 45, 90]) {
          pbr.anisotropyRotation = rotation;
          read().forEach((value, channel) => expect(Math.abs(value - reference[channel])).toBeLessThanOrEqual(1));
        }
      });
    } finally {
      ambient.specularTexture = previous;
      environment.destroy();
    }
  });

  it.each(
    [
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, 1],
      [-1, 1, -1],
      [1, -1, 1],
      [1, -1, -1],
      [-1, -1, 1],
      [-1, -1, -1]
    ].flatMap(([scaleX, scaleY, handedness]) =>
      [false, true].map((withTexture) => ({ scaleX, scaleY, handedness, withTexture }))
    )
  )(
    "uses mesh tangents (scale $scaleX, $scaleY; handedness $handedness; texture $withTexture)",
    ({ scaleX, scaleY, handedness, withTexture }) => {
      // UV derivatives point along +X, but the authored tangent is rotated clockwise by 30 degrees.
      const tangentAngle = -Math.PI / 6;
      const tangent = new Vector4(Math.cos(tangentAngle), Math.sin(tangentAngle), 0, handedness);
      mesh.setTangents([tangent.clone(), tangent.clone(), tangent.clone()]);
      mesh.uploadData(false);
      renderer.entity.transform.setScale(scaleX, scaleY, 1);
      material.anisotropyRotation = 30;

      try {
        material.anisotropyTexture = withTexture ? texture : null!;
        texture.setPixelBuffer(new Uint8Array([218, 218, 128, 255]));
        const localAngle = Math.PI / 6 + (withTexture ? Math.PI / 4 : 0);
        const direction = tangentAngle + handedness * localAngle;
        expectDirectionAndStrength(
          new Vector3(scaleX * Math.cos(direction), scaleY * Math.sin(direction), 0),
          0.8 * (withTexture ? 128 / 255 : 1)
        );
      } finally {
        renderer.entity.transform.setScale(1, 1, 1);
      }
    }
  );

  it.each(
    [
      { transform: "world", worldScale: 2, skinScale: 1 },
      { transform: "skin", worldScale: 1, skinScale: 2 },
      { transform: "world and skin", worldScale: 1.5, skinScale: 2 },
      { transform: "mirrored skin", worldScale: 1, skinScale: -2 },
      { transform: "mirrored world and skin", worldScale: -1, skinScale: -2 },
      { transform: "blended rotations", worldScale: 1, skinScale: -1 / 3, blendedRotations: true }
    ].flatMap((scales) => [false, true].map((withTexture) => ({ ...scales, withTexture })))
  )(
    "keeps the tangent on a sloped surface after nonuniform $transform scaling (texture $withTexture)",
    ({ worldScale, skinScale, blendedRotations = false, withTexture }) => {
      const root = engine.sceneManager.activeScene!.createRootEntity();
      const slopedMesh = new ModelMesh(engine);
      renderer.entity.isActive = false;
      try {
        const s = Math.SQRT1_2;
        slopedMesh.setPositions([new Vector3(-s, -1, s), new Vector3(s, -1, -s), new Vector3(0, 1, 0)]);
        slopedMesh.setNormals(Array.from({ length: 3 }, () => new Vector3(s, 0, s)));
        slopedMesh.setTangents(Array.from({ length: 3 }, () => new Vector4(s, 0, -s, 1)));
        slopedMesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5, 1)]);
        slopedMesh.setIndices(new Uint16Array([0, 1, 2]));
        slopedMesh.addSubMesh(0, 3);
        slopedMesh.bounds.min.set(-3, -1, -1);
        slopedMesh.bounds.max.set(3, 1, 1);
        root.transform.setScale(worldScale, 1, 1);
        const entity = root.createChild();
        let slopedRenderer: MeshRenderer;
        if (skinScale !== 1) {
          const bones = Array.from({ length: blendedRotations ? 3 : 1 }, () => root.createChild());
          if (blendedRotations) {
            // Three proper rotations average to -I/3: the blended matrix reflects,
            // even though each individual joint matrix has positive determinant.
            bones[0].transform.setRotation(180, 0, 0);
            bones[1].transform.setRotation(0, 180, 0);
            bones[2].transform.setRotation(0, 0, 180);
          } else {
            bones[0].transform.setScale(skinScale, 1, 1);
          }
          const skin = new Skin("Anisotropy nonuniform scale");
          skin.rootBone = root;
          skin.bones = bones;
          skin.inverseBindMatrices = bones.map(() => new Matrix());
          const weights = blendedRotations ? new Vector4(1 / 3, 1 / 3, 1 / 3, 0) : new Vector4(1, 0, 0, 0);
          const indices = blendedRotations ? new Vector4(0, 1, 2, 0) : new Vector4(0, 0, 0, 0);
          slopedMesh.setBoneWeights(Array.from({ length: 3 }, () => weights.clone()));
          slopedMesh.setBoneIndices(Array.from({ length: 3 }, () => indices.clone()));
          const skinnedRenderer = entity.addComponent(SkinnedMeshRenderer);
          skinnedRenderer.skin = skin;
          skinnedRenderer.localBounds.copyFrom(slopedMesh.bounds);
          slopedRenderer = skinnedRenderer;
        } else {
          slopedRenderer = entity.addComponent(MeshRenderer);
        }
        slopedMesh.uploadData(false);
        slopedRenderer.mesh = slopedMesh;
        slopedRenderer.setMaterial(material);
        material.renderFace = RenderFace.Double;
        material.anisotropyRotation = 30;
        material.anisotropyTexture = withTexture ? texture : null!;
        texture.setPixelBuffer(new Uint8Array([218, 218, 128, 255]));

        // Derive the expected tangent from the transformed surface edge.
        const tangent = new Vector3(worldScale * skinScale, 0, blendedRotations ? -skinScale : -1).normalize();
        const bitangentY = blendedRotations ? -1 : 1;
        const angle = Math.PI / 6 + (withTexture ? Math.PI / 4 : 0);
        expectDirectionAndStrength(
          new Vector3(tangent.x * Math.cos(angle), bitangentY * Math.sin(angle), tangent.z * Math.cos(angle)),
          0.8 * (withTexture ? 128 / 255 : 1)
        );
      } finally {
        root.destroy();
        slopedMesh.destroy();
        material.renderFace = RenderFace.Front;
        renderer.entity.isActive = true;
      }
    }
  );

  it.each([1, -1])("rebuilds the interpolated anisotropy basis (handedness %i)", (handedness) => {
    const s = Math.sqrt(3) / 2;
    mesh.setNormals([new Vector3(0, -s, 0.5), new Vector3(0, -s, 0.5), new Vector3(0, s, 0.5)]);
    mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, handedness)));
    mesh.uploadData(false);
    material.anisotropyRotation = 45;
    material.anisotropyTexture = null!;
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    // Align pixel (8, 8) with world origin in the 16x16 render target.
    camera.entity.transform.setPosition(-1 / 16, 1 / 16, 3);
    try {
      // At the origin, interpolated N is +Z, T is +X, and B has length 0.5.
      expectDirectionAndStrength(new Vector3(Math.SQRT1_2, handedness * Math.SQRT1_2, 0), 0.8);
    } finally {
      camera.isOrthographic = false;
      camera.entity.transform.setPosition(0, 0, 3);
    }
  });

  it.each([1, -1])("keeps interpolated anisotropy on the tangent plane (handedness %i)", (handedness) => {
    const angle = (80 * Math.PI) / 180;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    mesh.setNormals([new Vector3(sine, 0, cosine), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
    mesh.setTangents([
      new Vector4(cosine, 0, -sine, handedness),
      new Vector4(0, 1, 0, handedness),
      new Vector4(0, 1, 0, handedness)
    ]);
    mesh.uploadData(false);
    material.anisotropyRotation = 30;
    material.anisotropyTexture = null!;
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.entity.transform.setPosition(-1 / 16, 1 / 16, 3);
    try {
      engine.update();
      const pixel = new Uint8Array(4);
      output.getPixelBuffer(8, 8, 1, 1, pixel);
      const direction = new Vector3((2 * pixel[0]) / 255 - 1, (2 * pixel[1]) / 255 - 1, (2 * pixel[2]) / 255 - 1);
      // Barycentric weights at world origin are (1/4, 1/4, 1/2).
      const normal = new Vector3(sine / 4, 0, (cosine + 3) / 4).normalize();
      expect(Math.abs(Vector3.dot(direction, normal)), "direction must lie on the tangent plane").toBeLessThan(0.015);
      expect(Math.abs(direction.length() - 1), "direction must remain a unit vector").toBeLessThan(0.015);
      expect(pixel[3], "anisotropy strength").toBe(204);
    } finally {
      camera.isOrthographic = false;
      camera.entity.transform.setPosition(0, 0, 3);
    }
  });

  it.each(
    ["normal", "clear coat"].flatMap((feature) =>
      [false, true].flatMap((curved) =>
        [0, 0.8].flatMap((anisotropy) => [1, -1].map((handedness) => ({ feature, curved, anisotropy, handedness })))
      )
    )
  )(
    "preserves baked $feature normals (curved $curved; anisotropy $anisotropy; sign $handedness)",
    ({ feature, curved, anisotropy, handedness }) => {
      if (curved) {
        const s = Math.sqrt(3) / 2;
        mesh.setNormals([new Vector3(0, -s, 0.5), new Vector3(0, -s, 0.5), new Vector3(0, s, 0.5)]);
      }
      mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, handedness)));
      mesh.uploadData(false);
      material.anisotropy = anisotropy;
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      camera.entity.transform.setPosition(-1 / 16, 1 / 16, 3);

      // Bake the known world normal (1,1,1) using the inverse of the original interpolated frame.
      // At the origin its diagonal is (1, sign * 0.5, 0.5) on the curve, or (1, sign, 1) on the plane.
      const baked = new Vector3(1, handedness * (curved ? 2 : 1), curved ? 2 : 1).normalize();
      texture.setPixelBuffer(
        new Uint8Array([baked.x, baked.y, baked.z, 1].map((v, i) => Math.round((i < 3 ? v * 0.5 + 0.5 : v) * 255)))
      );
      if (feature === "normal") {
        material.normalTexture = texture;
        material.shaderData.enableMacro("INSPECT_SURFACE_NORMAL");
      } else {
        material.clearCoat = 1;
        material.clearCoatNormalTexture = texture;
        material.shaderData.enableMacro("INSPECT_CLEAR_COAT_NORMAL");
      }
      expectDirectionAndStrength(new Vector3(1, 1, 1).normalize(), anisotropy);
    }
  );

  it.each([1, -1])("keeps a continuous anisotropy axis when all vertex signs are %i", (handedness) => {
    // All N/T pairs are orthonormal. The interpolated TBN determinant crosses zero here,
    // but the projected tangent remains nonzero and the authored handedness is constant.
    mesh.setPositions([new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 2, 0)]);
    mesh.setNormals([
      new Vector3(0.2991340023, 0.6246971823, 0.7212990219),
      new Vector3(0.4317038685, -0.826211593, 0.3619477496),
      new Vector3(-0.5453809543, 0.5981998432, 0.5871256784)
    ]);
    mesh.setTangents([
      new Vector4(-0.7631593422, -0.2971428765, 0.57384138, handedness),
      new Vector4(0.6334812807, -0.0079505881, -0.7737171674, handedness),
      new Vector4(0.5267652391, 0.7894699571, -0.3150485195, handedness)
    ]);
    mesh.bounds.max.y = 2;
    mesh.uploadData(false);
    material.anisotropyRotation = 45;
    camera.isOrthographic = true;
    camera.orthographicSize = 0.008;
    camera.entity.transform.setPosition(-0.2246208576, -0.2246208576, 3);
    engine.update();
    const directions = [
      [7, 8],
      [8, 7]
    ].map(([x, y]) => {
      const pixel = new Uint8Array(4);
      output.getPixelBuffer(x, y, 1, 1, pixel);
      expect(pixel[3], "both samples must hit the surface").toBe(204);
      return new Vector3(...Array.from(pixel.slice(0, 3), (value) => (value * 2) / 255 - 1)).normalize();
    });
    // Anisotropy axes are equivalent under a 180-degree reversal. Nearby samples must not jump 90 degrees.
    expect(Math.abs(Vector3.dot(directions[0], directions[1]))).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
  });

  it.each([
    ...["cancelled", "parallel", "both"].flatMap((kind) =>
      [1, -1].flatMap((handedness) => [30, 90].map((rotation) => ({ kind, handedness, rotation, y: 0, tilt: 0 })))
    ),
    ...[-0.002, 0.002, -1e-7, 1e-7].map((y) => ({ kind: "cancelled", handedness: 1, rotation: 90, y, tilt: 0 })),
    { kind: "both", handedness: 1, rotation: 30, y: 0, tilt: 60 },
    { kind: "uv", handedness: 1, rotation: 30, y: 0, tilt: 0 },
    { kind: "uv scaled", handedness: 1, rotation: 30, y: 0, tilt: 0 }
  ])(
    "recovers a degenerate anisotropy basis ($kind; sign $handedness; rotation $rotation; y $y; tilt $tilt)",
    ({ kind, handedness, rotation, y, tilt }) => {
      const s = Math.sqrt(3) / 2;
      if (kind === "cancelled" || kind === "parallel") {
        mesh.setNormals([new Vector3(s, 0, 0.5), new Vector3(-s, 0, 0.5), new Vector3(0, 0, 1)]);
      }
      if (kind === "parallel") {
        // Equal weights at the origin: T=(0,0,-0.5), N=(0,0,2/3), B=(sign/6,0,0).
        mesh.setPositions([new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 2, 0)]);
        mesh.bounds.max.y = 2;
        mesh.setTangents([
          new Vector4(s / 2, 0.5, -0.75, handedness),
          new Vector4(-s / 2, 0.5, -0.75, handedness),
          new Vector4(0, -1, 0, handedness)
        ]);
      } else if (kind === "uv") {
        mesh.setUVs(Array.from({ length: 3 }, () => new Vector2()));
      } else if (kind === "uv scaled") {
        // A tiny V gradient is still valid: increasing U points along -Y, and V along +X.
        mesh.setUVs([new Vector2(0, 0), new Vector2(0, 1), new Vector2(-10000, 0.5)]);
      } else {
        // At the origin T cancels; B is sign*X/4 for tilted normals, or also zero on the plane.
        mesh.setTangents([
          new Vector4(0, 1, 0, handedness),
          new Vector4(0, 1, 0, handedness),
          new Vector4(0, -1, 0, handedness)
        ]);
      }
      renderer.entity.transform.setRotation(0, tilt, 0);
      material.anisotropyRotation = rotation;
      texture.setPixelBuffer(new Uint8Array([128, 128, 255, 255]));
      material.normalTexture = texture;
      material.normalTextureIntensity = 0;
      camera.isOrthographic = true;
      camera.orthographicSize = 2;
      camera.entity.transform.setPosition(-1 / 8, 1 / 8 + y, 3);
      const angle = (rotation * Math.PI) / 180;
      if (y !== 0) {
        mesh.uploadData(false);
        engine.update();
        const pixel = new Uint8Array(4);
        output.getPixelBuffer(8, 8, 1, 1, pixel);
        // Both sides of the cancellation still describe the X axis at a 90-degree rotation.
        expect(Math.abs((pixel[0] * 2) / 255 - 1)).toBeGreaterThan(0.98);
        expect(Math.abs(pixel[1] - 127.5)).toBeLessThanOrEqual(2);
        expect(Math.abs(pixel[2] - 127.5)).toBeLessThanOrEqual(2);
        expect(pixel[3]).toBe(204);
      } else {
        // A surviving +sign*X bitangent and +Z normal imply T=-Y.
        // With no surviving axis, the documented normal-based fallback is X for N=Z,
        // or Y for N=(sqrt(3)/2,0,1/2). These geometric facts determine the expected rotation.
        const expected =
          kind === "cancelled" || kind === "parallel" || kind === "uv scaled"
            ? new Vector3(handedness * Math.sin(angle), -Math.cos(angle), 0)
            : tilt === 0
              ? new Vector3(Math.cos(angle), handedness * Math.sin(angle), 0)
              : new Vector3(-0.5 * Math.sin(angle), Math.cos(angle), s * Math.sin(angle));
        expectDirectionAndStrength(expected, 0.8);
      }
    }
  );

  it.each(
    [
      { width: 1, shear: 0, handedness: 1 },
      { width: 2, shear: 0, handedness: 1 },
      { width: 4, shear: 0, handedness: 1 },
      { width: 1, shear: 1, handedness: 1 },
      { width: 2, shear: 0, handedness: -1 },
      { width: 1, shear: 1, handedness: -1 }
    ].flatMap((uv) => [false, true].map((withTangents) => ({ ...uv, withTangents })))
  )(
    "uses UV directions independent of scale/shear (width $width; shear $shear; sign $handedness; tangents $withTangents)",
    ({ width, shear, handedness, withTangents }) => {
      mesh.setPositions([new Vector3(-width, -1, 0), new Vector3(width, -1, 0), new Vector3(0, 1, 0)]);
      mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5 + shear, handedness)]);
      if (withTangents) mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, handedness)));
      mesh.bounds.min.x = -width;
      mesh.bounds.max.x = width;
      mesh.uploadData(false);
      material.anisotropyRotation = 45;
      texture.setPixelBuffer(new Uint8Array([128, 128, 255, 255]));
      material.normalTexture = texture;
      material.normalTextureIntensity = 0;
      // At constant V, increasing U always moves along +X; the sign determines the orthogonal V side.
      expectDirectionAndStrength(new Vector3(Math.SQRT1_2, handedness * Math.SQRT1_2, 0), 0.8);
    }
  );

  it.each(
    ["none", "normal", "clear coat"].flatMap((feature) =>
      ["tangents", "normals", "positions"].flatMap((attributes) =>
        [false, true].map((backFace) => ({ feature, attributes, backFace }))
      )
    )
  )("orients $feature normals once ($attributes; back face $backFace)", ({ feature, attributes, backFace }) => {
    if (attributes === "tangents") mesh.setTangents(Array.from({ length: 3 }, () => new Vector4(1, 0, 0, 1)));
    if (attributes === "positions") mesh.setNormals(null);
    mesh.uploadData(false);
    material.anisotropy = 0;
    material.renderFace = RenderFace.Double;
    renderer.entity.transform.setRotation(0, backFace ? 180 : 0, 0);
    texture.setPixelBuffer(new Uint8Array([255, 128, 255, 255]));
    if (feature === "clear coat") {
      material.clearCoat = 1;
      material.clearCoatNormalTexture = texture;
      material.shaderData.enableMacro("INSPECT_CLEAR_COAT_NORMAL");
    } else {
      if (feature === "normal") material.normalTexture = texture;
      material.shaderData.enableMacro("INSPECT_SURFACE_NORMAL");
    }
    // A 180-degree Y rotation followed by the back-face flip preserves X/Z and negates Y.
    const expected =
      feature === "none" ? new Vector3(0, 0, 1) : new Vector3(1, (backFace ? -1 : 1) / 255, 1).normalize();
    expectDirectionAndStrength(expected, 0);
  });

  it("loads glTF radians as the equivalent material rotation in degrees", async () => {
    const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const expectedDegrees = [0, 90, 180, -90, 0];
    const extension = "KHR_materials_anisotropy";
    const glTF = {
      asset: { version: "2.0" },
      extensionsUsed: [extension],
      materials: [
        ...rotations.map((anisotropyRotation) => ({
          extensions: { [extension]: { anisotropyStrength: 0.8, anisotropyRotation } }
        })),
        { extensions: { [extension]: { anisotropyStrength: 0.8 } } }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(glTF)], { type: "model/gltf+json" }));
    let resource: GLTFResource | undefined;
    try {
      resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      expect(resource.materials).toHaveLength(expectedDegrees.length);
      resource.materials!.forEach((loaded: PBRMaterial, index) => {
        expect(loaded.anisotropyRotation).toBeCloseTo(expectedDegrees[index], 10);
      });
    } finally {
      resource?.destroy();
      URL.revokeObjectURL(url);
    }
  });
});
