import {
  BackgroundMode,
  Camera,
  CameraClearFlags,
  Color,
  Layer,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  Vector3,
  type Engine,
  type Entity
} from "@galacean/engine";
import heightSource from "@galacean/engine-terrain/shaders/terrain/TerrainHeight.glsl?raw";
import type { Observer } from "../spatial/guidance/VisibilityQuery";

export const PLANNING_TERRAIN_LAYER = Layer.Layer30;
export const PLANNING_DEPTH_FAR_M = 12000;
/** Uses the production vertex function, residency and renderer uniforms. No second terrain geometry. */
const source = `Shader "Planning/TerrainDepth" {
 SubShader "Default" { Pass "Forward" {
  Tags { pipelineStage = "Forward" }
  DepthState = { WriteEnabled = true; }
  BlendState = { Enabled = false; }
  RasterState = { CullMode = CullMode.Back; }
  RenderQueueType = Opaque;
  #include "ShaderLibrary/Common/Common.glsl"
  #include "ShaderLibrary/Common/Transform.glsl"
  #include "ShaderLibrary/Common/Attributes.glsl"
  ${heightSource}
  struct DepthVaryings { vec2 sourceXZ; float valid; };
  VertexShader = PlanningDepthVertex;
  FragmentShader = PlanningDepthFragment;
  DepthVaryings PlanningDepthVertex(Attributes attributes) {
   DepthVaryings v;
   TerrainProjectClipmapVertex vertex = terrainProjectClipmapVertexAt(attributes.POSITION);
   v.sourceXZ = vertex.sourceXZ; v.valid = vertex.valid;
   gl_Position = camera_VPMat * vec4(vertex.positionWS, 1.);
   return v;
  }
  void PlanningDepthFragment(DepthVaryings v) {
   if (v.valid < .999 || terrainProjectSolidAt(v.sourceXZ) < .5) discard;
   float value = floor(clamp(1. / gl_FragCoord.w / ${PLANNING_DEPTH_FAR_M}.0, 0., 1.) * 16777215.);
   vec3 bytes = vec3(mod(value, 256.), mod(floor(value / 256.), 256.), floor(value / 65536.));
   gl_FragColor = vec4(bytes / 255., 1.);
  }
 } }
}`;
/** Low-resolution diagnostic render of real Terrain, encoded as linear camera depth plus coverage. */
export class PlanningTerrainDepth {
  private camera: Camera;
  private texture?: Texture2D;
  private target?: RenderTarget;
  private pixels = new Uint8Array();
  constructor(
    private engine: Engine,
    parent: Entity,
    layer: Layer = PLANNING_TERRAIN_LAYER
  ) {
    this.camera = parent.createChild("Terrain diagnostic camera").addComponent(Camera);
    this.camera.enabled = false;
    this.camera.cullingMask = layer;
    this.camera.enableHDR = this.camera.enablePostProcess = false;
    this.camera.clearFlags = CameraClearFlags.All;
    this.camera.setReplacementShader(Shader.find("Planning/TerrainDepth") ?? Shader.create(source));
  }
  capture(observer: Observer, width: number, height: number): Uint8Array {
    if (!this.target || this.target.width !== width || this.target.height !== height) {
      this.target?.destroy();
      this.texture?.destroy();
      this.texture = new Texture2D(this.engine, width, height, TextureFormat.R8G8B8A8, false, false);
      this.target = new RenderTarget(this.engine, width, height, this.texture, TextureFormat.Depth, 1);
      this.camera.renderTarget = this.target;
      this.pixels = new Uint8Array(width * height * 4);
    }
    const camera = this.camera,
      p = observer.position,
      f = observer.forward;
    camera.nearClipPlane = observer.nearM;
    camera.farClipPlane = PLANNING_DEPTH_FAR_M;
    camera.fieldOfView = observer.verticalFovDegrees;
    // Rounding the diagnostic texture height must not change the camera frustum.
    camera.aspectRatio = observer.aspect;
    camera.entity.transform.setPosition(p.x, p.y, p.z);
    camera.entity.transform.lookAt(new Vector3(p.x + f.x, p.y + f.y, p.z + f.z));
    const scene = camera.scene!,
      mode = scene.background.mode,
      color = scene.background.solidColor.clone(),
      shadows = scene.castShadows;
    try {
      scene.background.mode = BackgroundMode.SolidColor;
      scene.background.solidColor = new Color(0, 0, 0, 0);
      scene.castShadows = false;
      camera.render();
      this.texture!.getPixelBuffer(this.pixels);
    } finally {
      scene.background.mode = mode;
      scene.background.solidColor = color;
      scene.castShadows = shadows;
    }
    return this.pixels;
  }
  dispose(): void {
    this.camera.entity.destroy();
    this.target?.destroy();
    this.texture?.destroy();
  }
}
