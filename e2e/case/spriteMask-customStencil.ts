/**
 * @title SpriteMaskCustomStencil
 * @category SpriteMask
 */

import {
  AssetType,
  Camera,
  Color,
  CompareFunction,
  Layer,
  Material,
  Script,
  Shader,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteRenderer,
  StencilOperation,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Custom sprite shader exposing all 12 stencil knobs as ShaderLab variables.
// Lets the test override stencil per-material via shaderData.setInt.
const customStencilShaderSource = `Shader "CustomStencilSprite" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }

      Bool stencilEnabled;
      Number stencilReferenceValue;
      Number stencilMask;
      Number stencilWriteMask;
      CompareFunction stencilCompareFunctionFront;
      CompareFunction stencilCompareFunctionBack;
      StencilOperation stencilPassOperationFront;
      StencilOperation stencilPassOperationBack;
      StencilOperation stencilFailOperationFront;
      StencilOperation stencilFailOperationBack;
      StencilOperation stencilZFailOperationFront;
      StencilOperation stencilZFailOperationBack;

      StencilState = {
        Enabled = stencilEnabled;
        ReferenceValue = stencilReferenceValue;
        Mask = stencilMask;
        WriteMask = stencilWriteMask;
        CompareFunctionFront = stencilCompareFunctionFront;
        CompareFunctionBack = stencilCompareFunctionBack;
        PassOperationFront = stencilPassOperationFront;
        PassOperationBack = stencilPassOperationBack;
        FailOperationFront = stencilFailOperationFront;
        FailOperationBack = stencilFailOperationBack;
        ZFailOperationFront = stencilZFailOperationFront;
        ZFailOperationBack = stencilZFailOperationBack;
      }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/Common.glsl"

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_uv;
        vec4 v_color;
      };

      mat4 renderer_MVPMat;
      sampler2D renderer_SpriteTexture;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      vec4 frag(Varyings v) {
        vec4 baseColor = texture2DSRGB(renderer_SpriteTexture, v.v_uv);
        return baseColor * v.v_color;
      }
    }
  }
}`;

/**
 * Seed all 12 stencil shaderData properties on a material to the StencilState
 * class field-initializer defaults. Galacean falls back to 0/false for any
 * variable-bound render-state slot whose shaderData is unset (Unity uniform
 * model), so tests that only override a few stencil knobs need to pre-fill
 * the rest to avoid them being silently zeroed.
 */
function seedStencilDefaults(material: Material): void {
  const data = material.shaderData;
  data.setInt("stencilEnabled", 0);
  data.setInt("stencilReferenceValue", 0);
  data.setInt("stencilMask", 0xff);
  data.setInt("stencilWriteMask", 0xff);
  data.setInt("stencilCompareFunctionFront", CompareFunction.Always);
  data.setInt("stencilCompareFunctionBack", CompareFunction.Always);
  data.setInt("stencilPassOperationFront", StencilOperation.Keep);
  data.setInt("stencilPassOperationBack", StencilOperation.Keep);
  data.setInt("stencilFailOperationFront", StencilOperation.Keep);
  data.setInt("stencilFailOperationBack", StencilOperation.Keep);
  data.setInt("stencilZFailOperationFront", StencilOperation.Keep);
  data.setInt("stencilZFailOperationBack", StencilOperation.Keep);
}

// Create engine
WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Register the custom stencil shader once.
  const customStencilShader = Shader.create(customStencilShaderSource);

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer0;

  // Create sprite and mask
  engine.resourceManager
    .load([
      {
        // Sprite texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*rgNGR4Vb7lQAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture
      },
      {
        // Mask texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*qyhFT5Un5AgAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture,
        params: {
          isSRGBColorSpace: false
        }
      }
    ])
    .then((textures: Texture2D[]) => {
      const pos = new Vector3();
      const scale = new Vector3();

      // Create sprites.
      const sprite = new Sprite(engine, textures[0]);
      const maskSprite = new Sprite(engine, textures[1]);

      // Create a sprite renderer that writes stencil.
      pos.set(0, 0, 0);
      scale.set(5, 5, 5);
      const writeStencilSR = addSpriteRenderer(pos, scale, sprite, SpriteMaskInteraction.None, Layer.Layer0, Layer.Layer0, 0);
      const writeStencilMaterial = createCustomStencilMaterial();
      writeStencilSR.setMaterial(writeStencilMaterial);
      const writeStencilData = writeStencilMaterial.shaderData;
      writeStencilData.setInt("stencilEnabled", 1);
      writeStencilData.setInt("stencilWriteMask", 0xff);
      writeStencilData.setInt("stencilPassOperationFront", StencilOperation.IncrementSaturate);

      // Create a sprite renderer that reads stencil.
      pos.set(3, 3, 0);
      const readStencilSR = addSpriteRenderer(pos, scale, sprite, SpriteMaskInteraction.None, Layer.Layer0, Layer.Layer0, 1);
      readStencilSR.color.set(1, 0, 0, 1);
      const readStencilMaterial = createCustomStencilMaterial();
      readStencilSR.setMaterial(readStencilMaterial);
      const readStencilData = readStencilMaterial.shaderData;
      readStencilData.setInt("stencilEnabled", 1);
      readStencilData.setInt("stencilReferenceValue", 1);
      readStencilData.setInt("stencilCompareFunctionFront", CompareFunction.LessEqual);
      readStencilData.setInt("stencilCompareFunctionBack", CompareFunction.LessEqual);

      // Create a sprite renderer with mask interaction (does not need custom stencil).
      pos.set(5, -3, 0);
      const maskSR = addSpriteRenderer(pos, scale, sprite, SpriteMaskInteraction.VisibleOutsideMask, Layer.Layer0, Layer.Layer0, 2);
      maskSR.color.set(0, 1, 0, 1);

      // Create a sprite mask.
      pos.set(20, 0, 0);
      addMask(pos, maskSprite, Layer.Layer0, Layer.Layer0);

      // Create another sprite renderer that reads stencil with a different comparison.
      pos.set(20, 10, 0);
      scale.set(3, 3, 3);
      const readStencilSR2 = addSpriteRenderer(pos, scale, sprite, SpriteMaskInteraction.None, Layer.Layer0, Layer.Layer0, 4);
      readStencilSR2.color.set(1, 0.5, 0.8, 1);
      const readStencilMaterial2 = createCustomStencilMaterial();
      readStencilSR2.setMaterial(readStencilMaterial2);
      const readStencilData2 = readStencilMaterial2.shaderData;
      readStencilData2.setInt("stencilEnabled", 1);
      readStencilData2.setInt("stencilReferenceValue", 1);
      readStencilData2.setInt("stencilCompareFunctionFront", CompareFunction.Greater);
      readStencilData2.setInt("stencilCompareFunctionBack", CompareFunction.Greater);

      updateForE2E(engine, 100, 100);
      initScreenshot(engine, camera);
    });

  engine.run();

  function createCustomStencilMaterial(): Material {
    const material = new Material(engine, customStencilShader);
    seedStencilDefaults(material);
    return material;
  }

  /**
   * Add sprite renderer and set mask interaction and layer.
   */
  function addSpriteRenderer(
    pos: Vector3,
    scale: Vector3,
    sprite: Sprite,
    maskInteraction: SpriteMaskInteraction,
    maskLayer: number,
    layer: number,
    priority: number
  ): SpriteRenderer {
    const entity = rootEntity.createChild("Sprite");
    entity.layer = layer;
    const renderer = entity.addComponent(SpriteRenderer);
    const { transform } = entity;

    transform.position = pos;
    transform.scale = scale;
    renderer.sprite = sprite;
    renderer.maskInteraction = maskInteraction;
    renderer.maskLayer = maskLayer;
    renderer.priority = priority;

    return renderer;
  }

  /**
   * Add sprite mask and set influence layers, include mask animation script.
   */
  function addMask<T extends Script>(pos: Vector3, sprite: Sprite, layer: number, influenceLayers: number): void {
    const entity = rootEntity.createChild(`Mask`);
    entity.layer = layer;
    const mask = entity.addComponent(SpriteMask);

    entity.transform.position = pos;
    mask.sprite = sprite;
    mask.influenceLayers = influenceLayers;
  }
});
