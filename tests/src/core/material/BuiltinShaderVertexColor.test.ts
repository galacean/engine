import {
  BlinnPhongMaterial,
  Camera,
  Color,
  DepthTextureMode,
  DirectLight,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderMacro,
  ShaderMacroCollection,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";

describe("Built-in shader vertex color regressions", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  function renderVertexColorCube(
    materialFactory: (eng: WebGLEngine) => UnlitMaterial | BlinnPhongMaterial,
    options?: {
      vertexColor?: Color;
      enableVertexColor?: boolean;
      setupScene?: (eng: WebGLEngine) => void;
    }
  ): Promise<Uint8Array> {
    return (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      engine = await WebGLEngine.create({ canvas });

      const scene = engine.sceneManager.activeScene;
      scene.background.solidColor = new Color(0, 0, 0, 1);
      options?.setupScene?.(engine);

      const cameraEntity = scene.createRootEntity("camera");
      const camera = cameraEntity.addComponent(Camera);
      camera.enableHDR = false;
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      cameraEntity.transform.setPosition(0, 0, 5);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

      const colorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, true);
      const renderTarget = new RenderTarget(engine, 64, 64, colorTexture, TextureFormat.Depth16);
      const vertexColor = options?.vertexColor ?? new Color(1, 0, 0, 1);
      const mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 1, { keepMeshData: true });
      const material = materialFactory(engine);

      const cubeEntity = scene.createRootEntity("cube");
      const renderer = cubeEntity.addComponent(MeshRenderer);

      try {
        camera.renderTarget = renderTarget;

        mesh.setColors(Array.from({ length: mesh.vertexCount }, () => vertexColor.clone()));
        mesh.uploadData(false);

        renderer.mesh = mesh;
        renderer.enableVertexColor = options?.enableVertexColor ?? true;
        material.baseColor = new Color(1, 1, 1, 1);
        renderer.setMaterial(material);

        camera.render();

        const pixel = new Uint8Array(4);
        colorTexture.getPixelBuffer(32, 32, 1, 1, 0, pixel);
        return pixel;
      } finally {
        renderer.mesh = null;
        renderer.setMaterial(null);
        camera.renderTarget = null;
        material.destroy();
        mesh.destroy();
        renderTarget.destroy();
        colorTexture.destroy();
      }
    })();
  }

  it("multiplies enabled vertex color into UnlitMaterial output", async () => {
    const pixel = await renderVertexColorCube((eng) => new UnlitMaterial(eng));
    expect(pixel[0]).toBeGreaterThan(240);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it("ignores vertex color on UnlitMaterial when enableVertexColor is false", async () => {
    const pixel = await renderVertexColorCube((eng) => new UnlitMaterial(eng), {
      enableVertexColor: false
    });
    expect(pixel[0]).toBeGreaterThan(240);
    expect(pixel[1]).toBeGreaterThan(240);
    expect(pixel[2]).toBeGreaterThan(240);
  });

  it("applies vertex color alpha before alpha cutoff in UnlitMaterial", async () => {
    const pixel = await renderVertexColorCube(
      (eng) => {
        const mat = new UnlitMaterial(eng);
        mat.alphaCutoff = 0.5;
        return mat;
      },
      { vertexColor: new Color(1, 0, 0, 0.2) }
    );
    // Discarded fragment should show black background (0, 0, 0)
    expect(pixel[0]).toBeLessThan(10);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it("applies vertex color to the BlinnPhongMaterial ambient lighting term", async () => {
    const pixel = await renderVertexColorCube((eng) => new BlinnPhongMaterial(eng), {
      setupScene: (eng) => {
        const scene = eng.sceneManager.activeScene;
        scene.ambientLight.diffuseSolidColor = new Color(1, 1, 1, 1);
        scene.ambientLight.diffuseIntensity = 0.5;
      }
    });
    expect(pixel[0]).toBeGreaterThan(150);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it("gates ShadowCaster and DepthOnly varyings so opaque meshes emit no dead varyings", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const compilePass = (shaderName: string, macroNames: string[]) => {
      const shader = Shader.find(shaderName);
      expect(shader).toBeTruthy();
      const pass = shader!.subShaders[0].passes[0];
      const macros = new ShaderMacroCollection();
      for (const name of macroNames) {
        macros.enable(ShaderMacro.getByName(name));
      }
      const { vertexSource, fragmentSource } = pass["_compileShaderSource"](engine!, macros, false);
      const program = pass._getShaderProgram(engine!, macros);
      expect(program.isValid).toBe(true);
      return { vertexSource, fragmentSource };
    };

    // Opaque ShadowCaster with vertex color & base texture must not emit dead varyings
    const opaqueShadow = compilePass("Pipeline/ShadowCaster", [
      "RENDERER_ENABLE_VERTEXCOLOR",
      "RENDERER_HAS_UV",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_NEED_TILING_OFFSET"
    ]);
    expect(opaqueShadow.vertexSource).not.toContain("v_vertexAlpha");
    expect(opaqueShadow.fragmentSource).not.toContain("v_vertexAlpha");
    expect(opaqueShadow.vertexSource).not.toContain("v_uv");
    expect(opaqueShadow.fragmentSource).not.toContain("v_uv");

    // AlphaCutoff ShadowCaster must pass vertex alpha and apply tilingOffset to UV
    const cutoffShadow = compilePass("Pipeline/ShadowCaster", [
      "RENDERER_ENABLE_VERTEXCOLOR",
      "RENDERER_HAS_UV",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_NEED_TILING_OFFSET",
      "MATERIAL_IS_ALPHA_CUTOFF"
    ]);
    expect(cutoffShadow.vertexSource).toContain("v_vertexAlpha");
    expect(cutoffShadow.fragmentSource).toContain("v_vertexAlpha");
    expect(cutoffShadow.vertexSource).toContain("material_TilingOffset");
    expect(cutoffShadow.fragmentSource).toContain("v_uv");

    // Transparent shadow caster must pass vertex alpha
    const transparentShadow = compilePass("Pipeline/ShadowCaster", [
      "RENDERER_ENABLE_VERTEXCOLOR",
      "SCENE_ENABLE_TRANSPARENT_SHADOW",
      "MATERIAL_IS_TRANSPARENT"
    ]);
    expect(transparentShadow.vertexSource).toContain("v_vertexAlpha");
    expect(transparentShadow.fragmentSource).toContain("v_vertexAlpha");

    // Opaque DepthOnly must keep empty fragment shader and zero varyings (Early-Z fast path)
    const opaqueDepth = compilePass("Pipeline/DepthOnly", [
      "RENDERER_ENABLE_VERTEXCOLOR",
      "RENDERER_HAS_UV",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_NEED_TILING_OFFSET"
    ]);
    expect(opaqueDepth.vertexSource).not.toContain("v_vertexAlpha");
    expect(opaqueDepth.fragmentSource).not.toContain("v_vertexAlpha");
    expect(opaqueDepth.vertexSource).not.toContain("v_uv");
    expect(opaqueDepth.fragmentSource).not.toContain("discard");

    // AlphaCutoff DepthOnly must pass vertex alpha and tiled UV and discard
    const cutoffDepth = compilePass("Pipeline/DepthOnly", [
      "RENDERER_ENABLE_VERTEXCOLOR",
      "RENDERER_HAS_UV",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_NEED_TILING_OFFSET",
      "MATERIAL_IS_ALPHA_CUTOFF"
    ]);
    expect(cutoffDepth.vertexSource).toContain("v_vertexAlpha");
    expect(cutoffDepth.fragmentSource).toContain("v_vertexAlpha");
    expect(cutoffDepth.vertexSource).toContain("material_TilingOffset");
    expect(cutoffDepth.fragmentSource).toContain("discard");
  });

  it("discards alpha-cutoff fragments in DepthOnlyPass for vertex color and tiled baseTexture", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0, 0, 0, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.nearClipPlane = 1;
    camera.farClipPlane = 10;
    camera.depthTextureMode = DepthTextureMode.PrePass;
    cameraEntity.transform.setPosition(0, 0, 5);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    const colorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, true);
    const renderTarget = new RenderTarget(engine, 64, 64, colorTexture, TextureFormat.Depth16);
    const readbackColorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, true);
    const readbackTarget = new RenderTarget(engine, 64, 64, readbackColorTexture, TextureFormat.Depth16);

    const mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 1, { keepMeshData: true });
    const material = new UnlitMaterial(engine);
    const readbackMesh = PrimitiveMesh.createCuboid(engine, 2, 2, 1);
    const readbackMaterial = new UnlitMaterial(engine);

    const halfAlphaTexture = new Texture2D(engine, 2, 1, TextureFormat.R8G8B8A8, false);
    halfAlphaTexture.filterMode = TextureFilterMode.Point;
    halfAlphaTexture.wrapModeU = TextureWrapMode.Repeat;
    halfAlphaTexture.wrapModeV = TextureWrapMode.Repeat;
    // Left half opaque (alpha=255), right half transparent (alpha=0)
    halfAlphaTexture.setPixelBuffer(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0]));

    const cubeEntity = scene.createRootEntity("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    const readbackEntity = scene.createRootEntity("readback");
    const readbackRenderer = readbackEntity.addComponent(MeshRenderer);

    const readCenterDepthByte = (): number => {
      cubeEntity.isActive = true;
      readbackEntity.isActive = false;
      camera.depthTextureMode = DepthTextureMode.PrePass;
      camera.renderTarget = renderTarget;
      camera.render();

      const depthTexture = camera.shaderData.getTexture("camera_DepthTexture") as Texture2D;
      expect(depthTexture).toBeTruthy();

      // Visualize camera_DepthTexture.r into readbackColorTexture via UnlitMaterial
      cubeEntity.isActive = false;
      readbackEntity.isActive = true;
      readbackMaterial.baseTexture = depthTexture;
      camera.depthTextureMode = DepthTextureMode.None;
      camera.renderTarget = readbackTarget;
      camera.render();

      const pixel = new Uint8Array(4);
      readbackColorTexture.getPixelBuffer(32, 32, 1, 1, 0, pixel);
      readbackMaterial.baseTexture = null;
      return pixel[0];
    };

    try {
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      material.baseColor = new Color(1, 1, 1, 1);

      readbackRenderer.mesh = readbackMesh;
      readbackRenderer.setMaterial(readbackMaterial);

      // 1. Opaque cube writes front surface depth (~0.389 linear -> ~168 sRGB byte, well below far plane 255)
      mesh.setColors(Array.from({ length: mesh.vertexCount }, () => new Color(1, 0, 0, 0.2)));
      mesh.uploadData(false);
      renderer.enableVertexColor = true;
      material.alphaCutoff = 0;
      const opaqueDepthByte = readCenterDepthByte();
      expect(opaqueDepthByte).toBeLessThan(200);

      // 2. AlphaCutoff with vertex alpha 0.2 < 0.5 discards fragment -> far plane (255)
      material.alphaCutoff = 0.5;
      const vertexCutoffDepthByte = readCenterDepthByte();
      expect(vertexCutoffDepthByte).toBeGreaterThan(250);

      // 3. AlphaCutoff with 2x1 half-alpha texture + tilingOffset shifting center UV onto opaque/transparent halves
      renderer.enableVertexColor = false;
      material.baseTexture = halfAlphaTexture;
      // Scale U to sample within left opaque half (u in [0, 0.25]) -> writes depth
      material.tilingOffset.set(0.25, 1, 0, 0);
      const tiledOpaqueDepthByte = readCenterDepthByte();
      expect(tiledOpaqueDepthByte).toBeLessThan(200);

      // Offset U by +0.6 into right transparent half (u in [0.6, 0.85]) -> discarded (far plane 255)
      material.tilingOffset.set(0.25, 1, 0.6, 0);
      const tiledCutoffDepthByte = readCenterDepthByte();
      expect(tiledCutoffDepthByte).toBeGreaterThan(250);
    } finally {
      renderer.mesh = null;
      renderer.setMaterial(null);
      readbackRenderer.mesh = null;
      readbackRenderer.setMaterial(null);
      camera.renderTarget = null;
      material.baseTexture = null;
      readbackMaterial.baseTexture = null;
      halfAlphaTexture.destroy();
      material.destroy();
      mesh.destroy();
      readbackMaterial.destroy();
      readbackMesh.destroy();
      renderTarget.destroy();
      colorTexture.destroy();
      readbackTarget.destroy();
      readbackColorTexture.destroy();
    }
  });

  it("aligns ShadowCaster alpha cutoff with material tilingOffset and vertex color alpha", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0, 0, 0, 1);
    scene.ambientLight.diffuseIntensity = 0;
    scene.castShadows = true;
    scene.shadowCascades = ShadowCascadesMode.NoCascades;
    scene.shadowResolution = ShadowResolution.Medium;
    scene.shadowDistance = 20;

    // 45-degree downward light from (0, 3, 3) -> (0, 0, 0) projects caster at (0, 1.5, 0) onto receiver at (0, 0, -1.5)
    const lightEntity = scene.createRootEntity("light");
    const light = lightEntity.addComponent(DirectLight);
    light.intensity = 1;
    light.color = new Color(1, 1, 1, 1);
    light.shadowType = ShadowType.Hard;
    light.shadowBias = 0.001;
    lightEntity.transform.setPosition(0, 3, 3);
    lightEntity.transform.lookAt(new Vector3(0, 0, 0));

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    camera.isOrthographic = true;
    camera.orthographicSize = 2.5;
    camera.nearClipPlane = 0.1;
    camera.farClipPlane = 20;
    cameraEntity.transform.setPosition(0, 0, 5);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    const colorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, true);
    const renderTarget = new RenderTarget(engine, 64, 64, colorTexture, TextureFormat.Depth16);

    const receiverMesh = PrimitiveMesh.createCuboid(engine, 6, 6, 0.1);
    const receiverMaterial = new BlinnPhongMaterial(engine);
    receiverMaterial.baseColor = new Color(1, 1, 1, 1);
    const receiverEntity = scene.createRootEntity("receiver");
    receiverEntity.transform.setPosition(0, 0, -1.5);
    const receiverRenderer = receiverEntity.addComponent(MeshRenderer);

    const casterMesh = PrimitiveMesh.createPlane(engine, 2, 1, 1, 1, true, { keepMeshData: true });
    const casterMaterial = new UnlitMaterial(engine);
    casterMaterial.baseColor = new Color(1, 1, 1, 1);
    casterMaterial.alphaCutoff = 0.5;
    const casterEntity = scene.createRootEntity("caster");
    casterEntity.transform.setPosition(0, 1.5, 0);
    casterEntity.transform.setRotation(90, 0, 0);
    const casterRenderer = casterEntity.addComponent(MeshRenderer);

    const halfAlphaTexture = new Texture2D(engine, 2, 1, TextureFormat.R8G8B8A8, false);
    halfAlphaTexture.filterMode = TextureFilterMode.Point;
    halfAlphaTexture.wrapModeU = TextureWrapMode.Repeat;
    halfAlphaTexture.wrapModeV = TextureWrapMode.Repeat;
    // Left half opaque (alpha=255), right half transparent (alpha=0)
    halfAlphaTexture.setPixelBuffer(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0]));

    const renderAndSampleShadowHalves = (): { left: number; right: number } => {
      engine!.update();
      const leftPixel = new Uint8Array(4);
      const rightPixel = new Uint8Array(4);
      // World y = 0 is row 32; x = 24 (~world -0.625) and x = 40 (~world +0.625) hit left/right shadow halves
      colorTexture.getPixelBuffer(24, 32, 1, 1, 0, leftPixel);
      colorTexture.getPixelBuffer(40, 32, 1, 1, 0, rightPixel);
      return { left: leftPixel[0], right: rightPixel[0] };
    };

    try {
      camera.renderTarget = renderTarget;

      receiverRenderer.mesh = receiverMesh;
      receiverRenderer.setMaterial(receiverMaterial);
      receiverRenderer.castShadows = false;
      receiverRenderer.receiveShadows = true;

      casterRenderer.mesh = casterMesh;
      casterRenderer.setMaterial(casterMaterial);
      casterRenderer.castShadows = true;
      casterRenderer.receiveShadows = false;

      // 1. BaseTexture with identity tilingOffset: left half shadowed, right half lit
      casterMaterial.baseTexture = halfAlphaTexture;
      casterMaterial.tilingOffset.set(1, 1, 0, 0);
      const unshifted = renderAndSampleShadowHalves();
      expect(unshifted.left).toBeLessThan(30);
      expect(unshifted.right).toBeGreaterThan(150);

      // 2. Shift tilingOffset.z by +0.5: opaque/transparent halves swap -> left half lit, right half shadowed
      casterMaterial.tilingOffset.set(1, 1, 0.5, 0);
      const shifted = renderAndSampleShadowHalves();
      expect(shifted.left).toBeGreaterThan(150);
      expect(shifted.right).toBeLessThan(30);

      // 3. Vertex color alpha below alphaCutoff discards shadow on both halves
      casterMaterial.baseTexture = null;
      casterRenderer.enableVertexColor = true;
      casterMesh.setColors(Array.from({ length: casterMesh.vertexCount }, () => new Color(1, 0, 0, 0.2)));
      casterMesh.uploadData(false);
      const discardedByVertexAlpha = renderAndSampleShadowHalves();
      expect(discardedByVertexAlpha.left).toBeGreaterThan(150);
      expect(discardedByVertexAlpha.right).toBeGreaterThan(150);

      // 4. Vertex color alpha above alphaCutoff casts shadow on both halves
      casterMesh.setColors(Array.from({ length: casterMesh.vertexCount }, () => new Color(1, 0, 0, 1.0)));
      casterMesh.uploadData(false);
      const castByVertexAlpha = renderAndSampleShadowHalves();
      expect(castByVertexAlpha.left).toBeLessThan(30);
      expect(castByVertexAlpha.right).toBeLessThan(30);
    } finally {
      receiverRenderer.mesh = null;
      receiverRenderer.setMaterial(null);
      casterRenderer.mesh = null;
      casterRenderer.setMaterial(null);
      camera.renderTarget = null;
      casterMaterial.baseTexture = null;
      halfAlphaTexture.destroy();
      receiverMaterial.destroy();
      receiverMesh.destroy();
      casterMaterial.destroy();
      casterMesh.destroy();
      renderTarget.destroy();
      colorTexture.destroy();
    }
  });
});
