/**
 * @title Sprite Material Blur
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*mcarQpZIA3QAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  BlendFactor,
  BlendOperation,
  Camera,
  CullMode,
  Entity,
  Material,
  RenderQueueType,
  Shader,
  Sprite,
  SpriteRenderer,
  Texture2D,
  TextureWrapMode,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 20);
  cameraEntity.addComponent(Camera).isOrthographic = true;

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*L2GNRLWn9EAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      // Create origin sprite entity.
      const texSize = new Vector2(texture.width, texture.height);
      const spriteEntity = rootEntity.createChild("spriteBlur");

      spriteEntity.addComponent(SpriteRenderer).sprite = new Sprite(
        engine,
        texture
      );
      // The blur algorithm will sample the edges of the texture.
      // Set the clamp warp mode to avoid mis-sampling caused by repeate warp mode.
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;

      // Display normal
      addCustomMaterialSpriteEntity(spriteEntity, -7.5, texSize, 0.0);
      // Display low blur
      addCustomMaterialSpriteEntity(spriteEntity.clone(), -2.5, texSize, 1.0);
      // Display moderate blur
      addCustomMaterialSpriteEntity(spriteEntity.clone(), 2.5, texSize, 2.0);
      // Display highly blur
      addCustomMaterialSpriteEntity(spriteEntity.clone(), 7.5, texSize, 3.0);
    });

  engine.run();

  function addCustomMaterialSpriteEntity(
    entity: Entity,
    posX: number,
    texSize: Vector2,
    blurSize: number
  ): void {
    rootEntity.addChild(entity);
    entity.transform.setPosition(posX, 0, 0);
    // Create material
    const material = new Material(engine, Shader.find("SpriteBlur"));
    entity.getComponent(SpriteRenderer).setMaterial(material);
    // Init state
    const target = material.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation =
      BlendOperation.Add;
    material.renderState.depthState.writeEnabled = false;
    material.renderState.renderQueueType = RenderQueueType.Transparent;
    material.renderState.rasterState.cullMode = CullMode.Off;
    // Set uniform
    material.shaderData.setVector2("u_texSize", texSize);
    material.shaderData.setFloat("u_blurSize", blurSize);
  }

  // Custom shader
  const spriteVertShader = `
  precision highp float;

  uniform mat4 camera_VPMat;

  attribute vec3 POSITION;
  attribute vec2 TEXCOORD_0;
  attribute vec4 COLOR_0;

  varying vec4 v_color;
  varying vec2 v_uv;

  void main()
  {
    gl_Position = camera_VPMat * vec4(POSITION, 1.0);
    v_color = COLOR_0;
    v_uv = TEXCOORD_0;
  }
`;

  const spriteFragmentShader = `
  precision mediump float;
  precision mediump int;

  uniform sampler2D renderer_SpriteTexture;
  uniform float u_blurSize;
  uniform vec2 u_texSize;

  varying vec2 v_uv;
  varying vec4 v_color;

  float normpdf(float x, float sigma) {
    return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
  }

  void main() {
    vec4 color = texture2D(renderer_SpriteTexture, v_uv);
    const int mSize = 11;
    const int kSize = (mSize - 1) / 2;
    float kernel[mSize];
    vec3 final_colour = vec3(0.0);

    // create the 1-D kernel
    float sigma = 7.0;
    float Z = 0.0;
    for (int i = 0; i <= kSize; ++i) {
      kernel[kSize+i] = kernel[kSize - i] = normpdf(float(i), sigma);
    }

    // get the normalization factor (as the gaussian has been clamped)
    for (int i = 0; i < mSize; ++i) {
      Z += kernel[i];
    }

    // read out the texels
    float offsetX = u_blurSize / u_texSize.x;
    float offsetY = u_blurSize / u_texSize.y;
    vec2 uv;
    for (int i = -kSize; i <= kSize; ++i) {
      for (int j = -kSize; j <= kSize; ++j) {
        uv = v_uv.xy + vec2(float(i) * offsetX, float(j) * offsetY);
        final_colour += kernel[kSize + j] * kernel[kSize + i] * texture2D(renderer_SpriteTexture, uv).rgb;
      }
    }

    gl_FragColor = vec4(final_colour / (Z * Z), color.a) * v_color;
  }
`;

  Shader.create("SpriteBlur", spriteVertShader, spriteFragmentShader);
});
