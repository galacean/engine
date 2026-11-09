import { MountedDecorationRenderer } from "./MountedDecorationRenderer";
import { RigidDecorationRenderer, type RigidDecorationBinding } from "./RigidDecorationRenderer";
import { injectWallRoofJoint } from "./ConstructionWallRoofJointShader";
import type { ConstructionWallRoofJoint } from "./ConstructionWallRoofJoint";
import { entranceBinding, injectConstructionEntrance } from "./ConstructionEntranceShader";
import type { ConstructionEntranceState } from "./ConstructionEntrance";
import { constructionLightingInstructions } from "./ConstructionSceneLighting";
import { leaseBuildingTexture, textureSourceColors } from "../resources/BuildingTextures";
import type { BuildingAssets, NativeBuildingUnit } from "../resources/BuildingAssetKit";
import { scaledNativeAttribute } from "../resources/BuildingGeometry";
import { ConstructionLoadError } from "./ConstructionLoadError";
import {
  injectMasonryTint,
  restoreMasonryTextureSamples,
  isMasonryBaseTexture,
  masonryBaseColorUniform,
  masonryAppearance,
  masonryFamilyTint,
  masonryTintRoles,
  masonryTintUniforms
} from "./MasonryAppearance";
import { restoreResource, restoreBuffer } from "@galacean/engine-modify/rendering/RestorableResources";

import { adaptBrickSdfCamera } from "./ResidentSdfCamera";
import { WoodUnitLod, GableWoodUnitLod } from "./WoodUnitLod.js";
import { MaterialUnitLod } from "./MaterialUnitLod.js";
import { BrickUnitLod } from "./BrickUnitLod.js";

import { injectConstructionDecorationLighting } from "./ConstructionDecorationLightShader";
import { injectConstructionRoofClip } from "./ConstructionRoofClipShader";
import lodDither from "./MasonryLodDither.glsl?raw";
import { leaseResidentResource } from "./ResidentResourcePool";
import {
  Engine,
  Entity,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  BufferMesh,
  MeshRenderer,
  Material,
  Shader,
  ShaderPass,
  ShaderLanguage,
  VertexElement,
  VertexElementFormat,
  IndexFormat,
  Texture2D,
  Texture2DArray,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  CullMode,
  CompareFunction,
  Camera,
  Script,
  Matrix,
  Vector4
} from "@galacean/engine";
import { NATIVE_DORMER_GRID } from "./DormerBins";
import { engineShaderSource } from "./EngineShaderSource";
import { EngineRoofFeedback } from "./EngineRoofFeedback";
import { resolveDocument } from "./PlacementDocument.js";
class ConstructionCameraSync extends Script {
  sync: ((camera: Camera, includeInactive?: boolean) => void) | null = null;
  onBeginRender(camera: Camera) {
    this.sync?.(camera);
  }
}
const programs = new Map<string, Promise<Shader>>();
function residentShader(vertex: string, fragment: string) {
  const source = JSON.stringify([vertex, fragment, "GLES300/cullOff/depthLessEqual"]);
  let result = programs.get(source);
  if (!result) {
    result = (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      const name = "Masonry/" + Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
      const existing = Shader.find(name);
      if (existing) return existing;
      // Link engine-compiled scene lighting into recovered ES, preserving scene
      // feature macros and the existing raw picking/deformation ABI.
      const pass = new ShaderPass(
        "Forward",
        [
          [1, "RENDERER_MASONRY_ENTRANCE", 2],
          [0, "#define RENDERER_MASONRY_ENTRANCE\n"],
          [0, vertex]
        ],
        constructionLightingInstructions(fragment),
        ShaderLanguage.GLSLES300
      );
      const state = (
        pass as unknown as {
          _renderState: {
            rasterState: { cullMode: CullMode };
            depthState: { compareFunction: CompareFunction };
          };
        }
      )._renderState;
      state.rasterState.cullMode = CullMode.Off;
      // The click-only identity pass reuses the already rendered depth.
      state.depthState.compareFunction = CompareFunction.LessEqual;
      return Shader.create(name, [pass])!;
    })().catch((e) => {
      programs.delete(source);
      throw e;
    });
    programs.set(source, result);
  }
  return result;
}
export function residentFragment(source: string) {
  const encoded = "residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);";
  if (!source.includes(encoded)) throw Error("Unknown recovered display wrapper");
  // Native distance-field materials publish the hit depth, not the rasterized
  // proxy face. Picking must encode that same value for every such material.
  const pickDepth = /\bgl_FragDepth\s*=/.test(source) ? "gl_FragDepth" : "gl_FragCoord.z";
  // The Engine flips projection when drawing into its internal color target.
  // Preserve the original top-down derivative convention across both targets.
  return (
    "uniform vec4 camera_ProjectionParams;\nuniform float renderer_WorldPickBase;\nuniform float renderer_MasonryPickObjects;\n" +
    lodDither.replace("float renderer_MasonryLodFade;", "uniform float renderer_MasonryLodFade;") +
    source
      .replace(encoded, "residentColor=vec4(v,1.0);")
      .replace(/void main\(\)\s*\{/, "void main(){ masonryLodDither();")
      .replaceAll("return -dFdy(x);", "return -dFdy(x)*camera_ProjectionParams.x;")
      .replace(
        /}\s*$/,
        `
#ifdef RENDERER_WORLD_PICK
 float pickId=floor(renderer_WorldPickBase+0.5);
${source.includes("flat in float masonryPickIndex;") ? "pickId+=floor(masonryPickIndex+0.5)*renderer_MasonryPickObjects;" : ""}
#ifdef RENDERER_WORLD_PICK_DEPTH
 pickId=floor(${pickDepth}*16777215.0+0.5);
#endif
 residentColor=vec4(mod(pickId,256.0),mod(floor(pickId/256.0),256.0),floor(pickId/65536.0),255.0)/255.0;
#endif
}`
      )
  );
}
function unitVertex(source: string) {
  return (
    "in float masonryUnitFade;\nflat out float masonryUnitWeight;\n" +
    source.replace("original_main();", "masonryUnitWeight=masonryUnitFade;original_main();")
  );
}
function unitFragment(source: string, low: boolean) {
  const gate = `
flat in float masonryUnitWeight;
void masonryUnitCoverage(){
 vec2 p=mod(floor(gl_FragCoord.xy),4.0),a=mod(p,2.0),b=floor(p/2.0);
 float t=(4.0*(2.0*a.x+3.0*a.y-4.0*a.x*a.y)+(2.0*b.x+3.0*b.y-4.0*b.x*b.y)+0.5)/16.0;
 if(${low ? "t <= masonryUnitWeight" : "t > masonryUnitWeight"}) discard;
}
`;
  return gate + source.replace("masonryLodDither();", "masonryLodDither();masonryUnitCoverage();");
}
interface UnitDrawLod {
  selector: MaterialUnitLod;
  lists: Texture2D[];
  words: Uint32Array[];
  fades: Buffer[];
  forced: number;
  active: boolean;
}
export interface ResidentResource {
  kind: "storage" | "uniform" | "texture";
  file?: string;
  texture?: string;
  array?: boolean;
}
export interface ResidentDraw {
  nativeUnit?: NativeBuildingUnit;
  nativeMaterial?: Material;
  geometryScale?: readonly [number, number, number];
  /** Optional identities encoded per vertex, without splitting a merged draw. */
  pickIds?: string[];
  /** A whole native draw can belong to an attachment while retaining its host's animation/color owner. */
  pickId?: string;
  rigidBindings?: RigidDecorationBinding[];
  /** One native draw belongs to one attachment; no shader picking slot is needed. */
  objectBinding?: RigidDecorationBinding;
  wallRoofJoint?: ConstructionWallRoofJoint;
  id: string;
  ownerId?: string;
  family: string;
  program: string;
  count: number;
  indexCount: number;
  indices: string;
  attributes: Array<{
    location: number;
    size: number;
    stride: number;
    offset: number;
    file: string;
    integer?: boolean;
  }>;
  resources: Record<string, ResidentResource>;
  instance_buffer?: {
    file: string;
    stride: number;
    feedback?: { steps: Parameters<EngineRoofFeedback["run"]>[0] };
  } | null;
  lod?: Pick<ResidentDraw, "attributes" | "indices" | "indexCount">;
  variant?: string | null;
  group?: number | null;
  indirection?: string;
}
export interface ResidentPackage {
  /** Production material preview; omitted for immutable source-parity packages. */
  whiteBase?: boolean;
  /** Dense slot order matches the compiler's construction owners. */
  colorOwners?: Array<{ id: string; seed: number }>;
  dormerGrid?: import("./DormerBins").DormerGrid;
  nativeAssets?: BuildingAssets;
  brickSdf?: { programs: ResidentPackage["programs"]; proxyIndices: number[] };
  programs: Record<string, { vert: { source: string }; frag: { source: string } }>;
  textures: Record<
    string,
    { texture: Texture2D | Texture2DArray; neutral?: Texture2D | Texture2DArray; colors?: Float32Array }
  >;
  draws: ResidentDraw[];
  document?: any;
  groups?: any[];
  plans?: any[];
}
/** Renderer adapter on the host Engine. Receives source-produced instance bytes
 * and immutable assets; no subprocess, readback, second canvas or render loop.
 * Call destroy before releasing the host scene. */
export class EngineResidentScene {
  readonly root: Entity;
  readonly metrics = {
    uploadBytes: 0,
    residentBytes: 0,
    feedbackDispatches: 0,
    readbacks: 0,
    lodUploadBytes: 0,
    lodSelectionMs: 0,
    lod: 0,
    fullCoverage: false,
    triangles: 0,
    fullTriangles: 0,
    mediumTriangles: 0
  };
  readonly draws = new Map<
    string,
    {
      ownerId?: string;
      pickIds?: readonly string[];
      pickId?: string;
      rigidBindings?: readonly RigidDecorationBinding[];
      objectBinding?: RigidDecorationBinding;
      renderer: MeshRenderer;
      lodRenderer: MeshRenderer;
      enabled: boolean;
      mesh: BufferMesh;
      meshes: BufferMesh[];
      material: Material;
      visibility?: { buffer: Buffer; values: Float32Array };
      unitLod?: UnitDrawLod;
      resources: Map<string, Texture2D>;
    }
  >();
  private readonly resources: Array<{ destroy: () => void }> = [];
  private readonly simulations: EngineRoofFeedback[] = [];
  private readonly textureCache = new Map<string, Promise<Texture2D | Texture2DArray>>();
  private readonly bufferCache = new Map<string, Promise<Buffer>>();
  private readonly storageCache = new Map<string, Promise<Texture2D>>();
  private readonly storageData = new Map<Texture2D, Uint32Array>();
  private readonly viewData = new Map<Texture2D, Uint32Array>();
  private disposed = false;
  private lodStates: readonly { lodIndex: number; signedFade: number }[] = [{ lodIndex: 0, signedFade: 1 }];
  private syncCamera: (() => void) | null = null;
  private pack: ResidentPackage | null = null;
  private entranceBindings: { owner?: string; apply: ReturnType<typeof entranceBinding> }[] = [];
  /** Shares author-owned progress across resident meshes and material variants. */
  setEntrance(states: ReadonlyMap<string, ConstructionEntranceState>) {
    for (const binding of this.entranceBindings) {
      if (binding.owner === undefined) throw Error("Animated construction draw requires an explicit owner");
      binding.apply(states.get(binding.owner), this.root.transform.position.y);
    }
  }
  constructor(
    private readonly engine: Engine,
    parent: Entity,
    private readonly asset: (name: string) => Promise<ArrayBuffer>,
    private readonly bounds?: { min: number[]; max: number[] }
  ) {
    this.root = parent.createChild("Masonry");
  }
  private own<T extends { destroy: () => void }>(r: T): T {
    this.resources.push(r);
    return r;
  }
  private async buffer(name: string, kind: BufferBindFlag) {
    const key = `${kind}:${name}`;
    let p = this.bufferCache.get(key);
    if (!p) {
      const create = async () => {
        const raw = await this.asset(name);
        this.metrics.uploadBytes += raw.byteLength;
        return restoreBuffer(new Buffer(this.engine, kind, new Uint8Array(raw), BufferUsage.Static, false), raw);
      };
      p = create().then((r) => {
        this.metrics.residentBytes += r.byteLength;
        return this.own(r);
      });
      this.bufferCache.set(key, p);
    }
    return p;
  }
  private storage(name: string) {
    let promise = this.storageCache.get(name);
    if (!promise) {
      promise = this.createStorage(name);
      this.storageCache.set(name, promise);
    }
    return promise;
  }
  private async createStorage(name: string) {
    const raw = await this.asset(name),
      count = Math.max(1, Math.ceil(raw.byteLength / 16)),
      width = Math.min(1024, count),
      height = Math.ceil(count / width),
      words = new Uint32Array(width * height * 4);
    new Uint8Array(words.buffer).set(new Uint8Array(raw));
    const t = this.own(new Texture2D(this.engine, width, height, TextureFormat.R32G32B32A32_UInt, false, false));
    t.filterMode = TextureFilterMode.Point;
    t.wrapModeU = t.wrapModeV = TextureWrapMode.Clamp;
    t.setPixelBuffer(words);
    this.storageData.set(t, words);
    restoreResource(t, () => t.setPixelBuffer(words));
    this.metrics.uploadBytes += words.byteLength;
    this.metrics.residentBytes += words.byteLength;
    return t;
  }
  bindCamera(camera: Camera) {
    const script = camera.entity.addComponent(ConstructionCameraSync),
      inverse = new Matrix(),
      localView = new Matrix(),
      modelView = new Matrix();
    script.sync = (_camera, includeInactive = false) => {
      if (!includeInactive && !this.root.isActiveInHierarchy) return;
      Matrix.invert(this.root.transform.worldMatrix, inverse);
      Matrix.multiply(inverse, camera.entity.transform.worldMatrix, localView);
      Matrix.multiply(camera.viewMatrix, this.root.transform.worldMatrix, modelView);
      const model = this.root.transform.worldMatrix.elements;
      const scale = Math.max(
        Math.hypot(model[0], model[1], model[2]),
        Math.hypot(model[4], model[5], model[6]),
        Math.hypot(model[8], model[9], model[10])
      );
      const pixelScale =
        0.5 *
        Math.abs(camera.projectionMatrix.elements[5]) *
        Math.max(1080, Math.min(2160, camera.pixelViewport.height));
      const selectionStart = performance.now();
      for (const draw of this.draws.values()) {
        const lod = draw.unitLod;
        if (!lod || !lod.active || !draw.enabled) continue;
        if (lod.selector.update(modelView.elements, pixelScale, camera.isOrthographic, scale, lod.forced)) {
          const counts = [lod.selector.highCount, lod.selector.lowCount];
          const ids = [lod.selector.high, lod.selector.low],
            fades = [lod.selector.highFade, lod.selector.lowFade];
          for (let i = 0; i < 2; i++) {
            lod.words[i].set(ids[i].subarray(0, counts[i]));
            lod.lists[i].setPixelBuffer(lod.words[i]);
            const bytes = lod.words[i].byteLength + counts[i] * 4;
            this.metrics.lodUploadBytes += bytes;
            this.metrics.uploadBytes += bytes;
            if (counts[i]) lod.fades[i].setData(fades[i], 0, 0, counts[i]);
            draw.meshes[i].instanceCount = counts[i];
          }
        }
        draw.renderer.enabled = lod.active && lod.selector.highCount > 0;
        draw.lodRenderer.enabled = lod.active && lod.selector.lowCount > 0;
      }
      this.metrics.lodSelectionMs = performance.now() - selectionStart;
      this.updateTriangleMetrics();
      for (const [texture, words] of this.viewData) {
        const data = new Float32Array(words.buffer);
        let changed = false;
        // Native std140 declares row_major; Engine Matrix stores columns. The
        // reflected reader already honors the declaration. Convert at the writer.
        for (let i = 0; i < 16; i++) {
          const value = localView.elements[(i % 4) * 4 + Math.floor(i / 4)];
          if (data[80 + i] !== value) {
            data[80 + i] = value;
            changed = true;
          }
        }
        if (changed) texture.setPixelBuffer(words);
      }
    };
    this.resources.push(script);
    this.syncCamera = () => script.sync?.(camera, true);
    script.sync(camera);
  }
  private texture(name: string, array: boolean, pack: ResidentPackage) {
    const whiteBase = !!pack.whiteBase && isMasonryBaseTexture(name);
    const key = `${array}:${name}:${whiteBase}`;
    let p = this.textureCache.get(key);
    if (!p) {
      const lease = leaseBuildingTexture(this.engine, name, pack.textures[name], whiteBase);
      this.resources.push(lease);
      p = lease.value;
      this.textureCache.set(key, p);
    }
    return p;
  }
  async load(pack: ResidentPackage) {
    this.pack = pack;
    // Device loss invalidates a load transaction even if restoration finishes
    // before its remaining assets arrive. Rebuild from source on the caller's
    // existing retry path; never publish a mixture of empty and restored data.
    let interrupted = (
      this.engine as unknown as { _hardwareRenderer: { isContextLost(): boolean } }
    )._hardwareRenderer.isContextLost();
    const onLost = () => {
      interrupted = true;
    };
    const ensureUninterrupted = () => {
      if (interrupted) throw new ConstructionLoadError("Construction upload interrupted by device loss", true);
    };
    this.engine.on("devicelost", onLost);
    try {
      ensureUninterrupted();
      let slice = performance.now();
      for (const draw of pack.draws)
        if (draw.count) {
          await this.prepare(draw, pack);
          ensureUninterrupted();
          if (performance.now() - slice >= 4) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            ensureUninterrupted();
            slice = performance.now();
          }
        }
    } catch (e) {
      this.destroy();
      if (interrupted)
        throw new ConstructionLoadError("Construction upload interrupted by device loss", true, { cause: e });
      throw e;
    } finally {
      this.engine.off("devicelost", onLost);
    }
  }
  applyDocument(document: any) {
    if (!this.pack?.document) throw Error("This scene has no author placement document");
    const start = performance.now(),
      resolution = resolveDocument(this.pack, document);
    let bytes = 0;
    for (const group of resolution.selections)
      for (const d of this.pack.draws) {
        if (d.group !== group.group || !d.variant) continue;
        const active = this.draws.get(d.id);
        if (!active) continue;
        const ids = group.selections[d.variant];
        if (active.unitLod) {
          active.unitLod.selector.select(ids);
        } else if (active.visibility) {
          const mask = active.visibility.values;
          mask.fill(0);
          for (const i of ids) mask[i] = 1;
          active.visibility.buffer.setData(mask);
          bytes += mask.byteLength;
        } else {
          const t = active.resources.get(d.indirection!);
          if (!t) throw Error("Missing material indirection");
          const data = this.storageData.get(t)!;
          data.fill(0);
          data.set(ids);
          t.setPixelBuffer(data);
          for (const mesh of active.meshes) mesh.instanceCount = ids.length;
          bytes += data.byteLength;
        }
        active.enabled = ids.length > 0;
        active.renderer.enabled = active.enabled;
        active.lodRenderer.enabled = false;
      }
    this.setLodStates(this.lodStates);
    this.syncCamera?.();
    return {
      resolveAndUploadMs: performance.now() - start,
      uploadBytes: bytes,
      visibleCells: resolution.cells.filter((c) => !c.hidden).length
    };
  }
  private async prepare(d: ResidentDraw, pack: ResidentPackage) {
    if (this.disposed) throw Error("Destroyed masonry scene");
    const brickSdf = pack.brickSdf;
    if (d.family === "brick" && !brickSdf) throw Error("Brick draw requires its package SDF assets");
    const isBrick = d.family === "brick" && Object.hasOwn(brickSdf!.programs, d.program);
    // Native ordinary/gable cullers share the affine screen metric but have
    // distinct record strides. Domain-roof deformation is a different consumer.
    const isWood =
      (d.family === "wood" || d.family === "wood-gable") && !!d.lod && !d.instance_buffer && !d.resources.domain_roof;
    const isUnit = isBrick || isWood;
    // Host plaster owns its albedo stage; native programs use the recovered G-buffer ABI.
    const tintRole = pack.whiteBase && d.family !== "plaster" ? masonryFamilyTint(d.family) : undefined;
    const baseBindings = Object.entries(d.resources).flatMap(([sampler, r]) =>
      r.kind === "texture" && isMasonryBaseTexture(r.texture!)
        ? [
            {
              sampler,
              layers:
                pack.textures[r.texture!].texture instanceof Texture2DArray
                  ? (pack.textures[r.texture!].texture as Texture2DArray).length
                  : 1,
              array: !!r.array
            }
          ]
        : []
    );
    const bindTexture = async (material: Material, name: string, resource: ResidentResource) => {
      const authored = (d.nativeMaterial ?? d.nativeUnit?.material)?.shaderData.getTexture(name);
      const registered = pack.textures[resource.texture!];
      const texture =
        authored && authored !== registered?.texture
          ? authored
          : await this.texture(resource.texture!, !!resource.array, pack);
      material.shaderData.setTexture(name, texture);
      const sourceColors =
        texture instanceof Texture2D || texture instanceof Texture2DArray
          ? textureSourceColors.get(texture)
          : undefined;
      if (sourceColors)
        this.resources.push(
          masonryAppearance(this.engine).subscribe(() => {
            material.shaderData.setFloatArray(
              masonryBaseColorUniform(name),
              masonryAppearance(this.engine).textureColors(
                resource.texture!,
                sourceColors,
                d.family === "decoration" || d.family === "stone-decoration" || d.family === "stone-floor"
              )
            );
          })
        );
    };
    const bindTint = (material: Material) => {
      if (d.wallRoofJoint) {
        const j = d.wallRoofJoint;
        material.shaderData.setVector4("material_WallJointAxis", new Vector4(j.axis[0], j.axis[1], j.center, j.bottom));
        material.shaderData.setVector4("material_WallJointSection", new Vector4(j.bottom - j.top, j.base, 0, 0));
        material.shaderData.setFloatArray("material_WallJointHeights", Float32Array.from(j.heights));
      }
      if (!pack.whiteBase) return;
      const appearance = masonryAppearance(this.engine);
      if (tintRole)
        this.resources.push(
          appearance.subscribe(() => {
            material.shaderData.setVector4("material_MasonryTint", new Vector4(...appearance.tint(tintRole)));
          })
        );
      if (d.family === "decoration" || d.family === "plaster") {
        this.resources.push(
          appearance.subscribe(() => {
            masonryTintRoles.forEach((role, i) =>
              material.shaderData.setVector4(masonryTintUniforms[i], new Vector4(...appearance.tint(role)))
            );
          })
        );
      }
    };
    const original = pack.programs[d.program],
      clipped = injectConstructionRoofClip(original.vert.source, original.frag.source),
      jointClipped = injectWallRoofJoint(clipped.vertex, clipped.fragment, !!d.wallRoofJoint),
      lit = injectConstructionDecorationLighting(jointClipped.vertex, jointClipped.fragment),
      v = engineShaderSource(lit.vertex),
      f = engineShaderSource(
        tintRole
          ? injectMasonryTint(lit.fragment, baseBindings)
          : pack.whiteBase
            ? restoreMasonryTextureSamples(lit.fragment, baseBindings)
            : lit.fragment
      ),
      entrance = injectConstructionEntrance(v.source, f.source, d.family);
    // Engine owns the model/view/projection and depth convention. The recovered
    // shader still computes the same final deformed local position before this.
    let vertex = entrance.vertex
      .replace(/gl_Position = (.+) \* current_view\.world_to_sample;/g, "gl_Position = renderer_MVPMat * $1;")
      .replace("gl_Position.z=gl_Position.z*2.0-gl_Position.w;", "");
    vertex = "uniform mat4 renderer_MVPMat;\n" + vertex;
    const declarations = new Map<number, { type: string; name: string }>();
    for (const m of vertex.matchAll(/layout\(location\s*=\s*(\d+)\) in (\w+) (\w+);/g))
      declarations.set(Number(m[1]), { type: m[2], name: m[3] });
    const bindTemplate = async (mesh: BufferMesh, attributes: ResidentDraw["attributes"]) => {
      const elements: VertexElement[] = [];
      for (const a of attributes) {
        const decl = declarations.get(a.location);
        if (!decl) throw Error("Missing template shader attribute");
        const binding = elements.length;
        if (a.integer) {
          if (a.size !== 1 || !["int", "uint"].includes(decl.type))
            throw Error("Unsupported template integer attribute");
          const input = "engine_" + decl.name;
          vertex = vertex.replace(
            new RegExp(`layout\\(location\\s*=\\s*${a.location}\\) in ${decl.type} ${decl.name};`),
            `layout(location=${a.location}) in float ${input};\n#define ${decl.name} ${decl.type}(${input})`
          );
          const createFlags = async () => {
            const raw = await this.asset(a.file),
              view = new DataView(raw),
              count = Math.floor((raw.byteLength - a.offset - 4) / a.stride) + 1,
              data = new Float32Array(count);
            for (let i = 0; i < count; i++) {
              const n = view.getInt32(a.offset + i * a.stride, true);
              if (Math.abs(n) > 16777216) throw Error("Template flag exceeds exact float integer domain");
              data[i] = n;
            }
            this.metrics.uploadBytes += data.byteLength;
            return restoreBuffer(
              new Buffer(this.engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Static, false),
              data
            );
          };
          const flags = this.own(await createFlags());
          this.metrics.residentBytes += flags.byteLength;
          elements.push(new VertexElement(input, 0, VertexElementFormat.Float, binding));
          mesh.setVertexBufferBinding(flags, 4, binding);
        } else {
          elements.push(
            new VertexElement(
              decl.name,
              a.offset,
              [
                VertexElementFormat.Float,
                VertexElementFormat.Vector2,
                VertexElementFormat.Vector3,
                VertexElementFormat.Vector4
              ][a.size - 1],
              binding
            )
          );
          mesh.setVertexBufferBinding(await this.buffer(a.file, BufferBindFlag.VertexBuffer), a.stride, binding);
        }
      }
      return elements;
    };
    const bindNative = (mesh: BufferMesh, source: BufferMesh) => {
      const unit = d.nativeUnit!,
        elements: VertexElement[] = [];
      source.vertexBufferBindings.forEach((binding, index) => {
        if (binding) mesh.setVertexBufferBinding(binding, index);
      });
      for (const element of source.vertexElements) {
        let name = element.attribute;
        if (unit.integerAttributes.includes(name)) {
          const declaration = [...declarations.entries()].find(([, v]) => v.name === name);
          if (!declaration) throw Error("Missing unit integer shader attribute: " + name);
          const [location, decl] = declaration,
            input = "engine_" + name;
          vertex = vertex.replace(
            new RegExp(`layout\\(location\\s*=\\s*${location}\\) in ${decl.type} ${name};`),
            `layout(location=${location}) in float ${input};\n#define ${name} ${decl.type}(${input})`
          );
          name = input;
        }
        const scale = d.geometryScale;
        const normal = element.attribute === unit.attributeLocations[2];
        if (scale && scale.some((v) => v !== 1) && (element.attribute === unit.attributeLocations[0] || normal)) {
          const data = scaledNativeAttribute(source, element.attribute, scale, normal);
          const buffer = this.own(
            restoreBuffer(new Buffer(this.engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Static, false), data)
          );
          const index = mesh.vertexBufferBindings.length;
          mesh.setVertexBufferBinding(buffer, 12, index);
          elements.push(new VertexElement(name, 0, VertexElementFormat.Vector3, index));
        } else elements.push(new VertexElement(name, element.offset, element.format, element.bindingIndex));
      }
      mesh.setIndexBufferBinding(source.indexBufferBinding);
      return elements;
    };
    const mesh = this.own(new BufferMesh(this.engine)),
      elements = d.nativeUnit ? bindNative(mesh, d.nativeUnit.mesh) : await bindTemplate(mesh, d.attributes);
    const templateBindingCount = mesh.vertexBufferBindings.length;
    let visibility: { buffer: Buffer; values: Float32Array } | undefined;
    let restoreFeedback: (() => void) | undefined;
    if (d.instance_buffer) {
      const binding = templateBindingCount;
      let buffer: Buffer;
      if (d.instance_buffer.feedback) {
        const initial = await this.asset(d.instance_buffer.file);
        const simulation = new EngineRoofFeedback(this.engine, initial);
        this.simulations.push(simulation);
        simulation.run(d.instance_buffer.feedback.steps);
        buffer = simulation.readBinding.buffer;
        const steps = d.instance_buffer.feedback.steps;
        restoreFeedback = () => {
          simulation.readBinding.buffer.setData(initial);
          simulation.run(steps);
          for (const target of meshes) target.setVertexBufferBinding(simulation.readBinding, binding);
        };
        this.metrics.feedbackDispatches += simulation.metrics.dispatches;
        this.metrics.uploadBytes += simulation.metrics.uploadBytes;
        this.metrics.residentBytes += simulation.metrics.uploadBytes * 2;
      } else buffer = await this.buffer(d.instance_buffer.file, BufferBindFlag.VertexBuffer);
      mesh.setVertexBufferBinding(buffer, 64, binding);
      for (let i = 0; i < 4; i++)
        elements.push(new VertexElement(`instanceWords${i}`, i * 16, VertexElementFormat.UInt4, binding, 1));
      const vb = binding + 1;
      const values = new Float32Array(d.count).fill(1);
      visibility = {
        values,
        buffer: this.own(
          restoreBuffer(
            new Buffer(this.engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Dynamic, false),
            values
          )
        )
      };
      this.metrics.residentBytes += d.count * 4;
      mesh.setVertexBufferBinding(visibility.buffer, 4, vb);
      elements.push(new VertexElement("engineVisible", 0, VertexElementFormat.Float, vb, 1));
      vertex = vertex.replace(
        "layout(location=12) in uint instanceVisible;",
        "layout(location=12) in float engineVisible;\n#define instanceVisible uint(engineVisible)"
      );
    }
    mesh.setVertexElements(elements);
    if (!d.nativeUnit)
      mesh.setIndexBufferBinding(await this.buffer(d.indices, BufferBindFlag.IndexBuffer), IndexFormat.UInt32);
    mesh.instanceCount = d.count;
    mesh.addSubMesh(0, d.indexCount);
    // Instances are already in the authoring coordinate domain. Explicit bounds
    // are refined by the compiler; this conservative initial bound avoids hiding
    // GPU-deformed instances based on the tiny source template's own bounds.
    const lo = this.bounds?.min ?? [-10000, -10000, -10000],
      hi = this.bounds?.max ?? [10000, 10000, 10000];
    mesh.bounds.min.set(lo[0], lo[1], lo[2]);
    mesh.bounds.max.set(hi[0], hi[1], hi[2]);
    const meshes = [mesh];
    if (d.lod && !isBrick) {
      const medium = this.own(new BufferMesh(this.engine)),
        mediumElements = d.nativeUnit
          ? bindNative(medium, d.nativeUnit.lodMesh!)
          : await bindTemplate(medium, d.lod.attributes);
      // Both representations share the exact same instance/feedback and edit-mask buffers.
      for (let i = templateBindingCount; i < mesh.vertexBufferBindings.length; i++)
        if (mesh.vertexBufferBindings[i]) medium.setVertexBufferBinding(mesh.vertexBufferBindings[i]!, i);
      medium.setVertexElements([
        ...mediumElements,
        ...elements.slice(d.nativeUnit ? d.nativeUnit.mesh.vertexElements.length : d.attributes.length)
      ]);
      if (!d.nativeUnit)
        medium.setIndexBufferBinding(await this.buffer(d.lod.indices, BufferBindFlag.IndexBuffer), IndexFormat.UInt32);
      medium.instanceCount = d.count;
      medium.addSubMesh(0, d.lod.indexCount);
      medium.bounds.copyFrom(mesh.bounds);
      meshes.push(medium);
    }
    if (restoreFeedback) restoreResource(mesh, restoreFeedback);
    const fragment = residentFragment(entrance.fragment);
    const unitSelector = isBrick
      ? new BrickUnitLod(new Uint8Array(await this.asset(d.resources.storage_0_1.file!)))
      : isWood
        ? new (d.family === "wood-gable" ? GableWoodUnitLod : WoodUnitLod)(
            new Uint8Array(await this.asset(d.resources.storage_0_0.file!))
          )
        : undefined;
    let unitFades: Buffer[] | undefined;
    if (isUnit) {
      unitFades = [unitSelector!.highFade, unitSelector!.lowFade].map((data) =>
        this.own(
          restoreBuffer(new Buffer(this.engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Dynamic, false), data)
        )
      );
      const binding = mesh.vertexBufferBindings.length;
      mesh.setVertexBufferBinding(unitFades[0], 4, binding);
      mesh.setVertexElements([
        ...elements,
        new VertexElement("masonryUnitFade", 0, VertexElementFormat.Float, binding, 1)
      ]);
      vertex = unitVertex(vertex);
    }
    const shader = await residentShader(vertex, isUnit ? unitFragment(fragment, false) : fragment);
    const material = this.own(
      (d.nativeMaterial ?? d.nativeUnit?.material)?.clone() ?? new Material(this.engine, shader)
    );
    material.shader = shader;
    bindTint(material);
    const dormerGrid = new Vector4(...(pack.dormerGrid ?? NATIVE_DORMER_GRID));
    material.shaderData.setVector4("renderer_DormerGrid", dormerGrid);
    const resources = new Map<string, Texture2D>();
    for (const [name, r] of Object.entries(d.resources)) {
      if (r.kind === "texture") {
        await bindTexture(material, name, r);
        continue;
      }
      const texture = await this.storage(r.file!);
      resources.set(name, texture);
      if (name === "ViewConstants_natural" && !this.viewData.has(texture)) {
        this.viewData.set(texture, this.storageData.get(texture)!);
      }
      material.shaderData.setTexture(r.kind === "uniform" ? "uniform_" + name : name, texture);
    }
    const entity = this.root.createChild(d.id),
      renderer = entity.addComponent(
        d.rigidBindings ? RigidDecorationRenderer : d.objectBinding ? MountedDecorationRenderer : MeshRenderer
      );
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.enabled = !d.variant || d.variant === "roof_tile";
    renderer.shaderData.setFloat("renderer_MasonryLodFade", 1);
    const lodRenderer = this.root
      .createChild(d.id + "/lod-transition")
      .addComponent(
        d.rigidBindings ? RigidDecorationRenderer : d.objectBinding ? MountedDecorationRenderer : MeshRenderer
      );
    lodRenderer.setMaterial(material);
    lodRenderer.mesh = meshes[meshes.length - 1];
    lodRenderer.enabled = false;
    lodRenderer.shaderData.setFloat("renderer_MasonryLodFade", 1);
    let unitLod: UnitDrawLod | undefined;
    let lowMaterial: Material | undefined;
    if (isBrick) {
      const lowProgram = brickSdf!.programs[d.program];
      const lowCamera = adaptBrickSdfCamera(lowProgram.vert.source, lowProgram.frag.source);
      const lowClipped = injectConstructionRoofClip(lowCamera.vertex, lowCamera.fragment);
      const lowJoint = injectWallRoofJoint(lowClipped.vertex, lowClipped.fragment, !!d.wallRoofJoint);
      const lowLit = injectConstructionDecorationLighting(lowJoint.vertex, lowJoint.fragment);
      const lowEntrance = injectConstructionEntrance(
        engineShaderSource(lowLit.vertex).source,
        engineShaderSource(tintRole ? injectMasonryTint(lowLit.fragment, baseBindings) : lowLit.fragment).source,
        d.family
      );
      let lowVertex = lowEntrance.vertex
        .replace(/gl_Position = (.+) \* current_view\.world_to_sample;/g, "gl_Position = renderer_MVPMat * $1;")
        .replace("gl_Position.z=gl_Position.z*2.0-gl_Position.w;", "");
      lowVertex =
        "uniform mat4 renderer_MVPMat;\nin float masonryProxyVertex;\n" +
        unitVertex(lowVertex.replaceAll("gl_VertexID", "int(masonryProxyVertex)"));
      const lowFragment = unitFragment(residentFragment(lowEntrance.fragment), true);
      lowMaterial = this.own(material.clone());
      lowMaterial.shader = await residentShader(lowVertex, lowFragment);
      bindTint(lowMaterial);
      lowMaterial.shaderData.setVector4("renderer_DormerGrid", dormerGrid);
      for (const [name, r] of Object.entries(d.resources)) {
        if (r.kind === "texture") {
          await bindTexture(lowMaterial, name, r);
          continue;
        }
        lowMaterial.shaderData.setTexture(r.kind === "uniform" ? "uniform_" + name : name, resources.get(name)!);
      }
      const sdfMaterial = d.nativeUnit?.sdfMaterial;
      if (!sdfMaterial) throw Error("Brick unit requires its native SDF material");
      for (const name of ["material_data_brick_sdf", "material_data_brick_sdf_normal"])
        lowMaterial.shaderData.setTexture(name, sdfMaterial.shaderData.getTexture(name));
      const lowMesh = this.own(new BufferMesh(this.engine));
      const indexLease = leaseResidentResource(
        this.engine,
        "brick-sdf-proxy-indices:" + JSON.stringify(brickSdf!.proxyIndices),
        async () => {
          const data = new Uint32Array(brickSdf!.proxyIndices);
          return restoreBuffer(
            new Buffer(this.engine, BufferBindFlag.IndexBuffer, data, BufferUsage.Static, false),
            data
          );
        }
      );
      this.resources.push(indexLease);
      lowMesh.setIndexBufferBinding(await indexLease.value, IndexFormat.UInt32);
      const vertexLease = leaseResidentResource(this.engine, "brick-sdf-proxy-vertices-v1", async () => {
        const data = Float32Array.from({ length: 8 }, (_, i) => i);
        return restoreBuffer(
          new Buffer(this.engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Static, false),
          data
        );
      });
      this.resources.push(vertexLease);
      lowMesh.setVertexBufferBinding(await vertexLease.value, 4, 0);
      lowMesh.setVertexBufferBinding(unitFades![1], 4, 1);
      lowMesh.setVertexElements([
        new VertexElement("masonryProxyVertex", 0, VertexElementFormat.Float, 0),
        new VertexElement("masonryUnitFade", 0, VertexElementFormat.Float, 1, 1)
      ]);
      lowMesh.addSubMesh(0, brickSdf!.proxyIndices.length);
      lowMesh.bounds.copyFrom(mesh.bounds);
      lowMesh.instanceCount = d.count;
      meshes.push(lowMesh);
      lodRenderer.mesh = lowMesh;
      lodRenderer.setMaterial(lowMaterial);
    } else if (isWood) {
      const medium = meshes[1],
        binding = medium.vertexBufferBindings.length;
      medium.setVertexBufferBinding(unitFades![1], 4, binding);
      medium.setVertexElements([
        ...medium.vertexElements,
        new VertexElement("masonryUnitFade", 0, VertexElementFormat.Float, binding, 1)
      ]);
      lowMaterial = this.own(new Material(this.engine, await residentShader(vertex, unitFragment(fragment, true))));
      bindTint(lowMaterial);
      lowMaterial.shaderData.setVector4("renderer_DormerGrid", dormerGrid);
      for (const [name, r] of Object.entries(d.resources)) {
        if (r.kind === "texture") {
          await bindTexture(lowMaterial, name, r);
          continue;
        }
        lowMaterial.shaderData.setTexture(r.kind === "uniform" ? "uniform_" + name : name, resources.get(name)!);
      }
      lodRenderer.setMaterial(lowMaterial);
    }
    if (isUnit) {
      if (!d.indirection) throw Error("Missing native material-unit indirection");
      const selector = unitSelector!;
      const highList = resources.get(d.indirection)!;
      const lowList = this.own(
        new Texture2D(this.engine, highList.width, highList.height, TextureFormat.R32G32B32A32_UInt, false, false)
      );
      lowList.filterMode = TextureFilterMode.Point;
      lowList.wrapModeU = lowList.wrapModeV = TextureWrapMode.Clamp;
      lowMaterial!.shaderData.setTexture(d.indirection, lowList);
      const highWords = this.storageData.get(highList)!;
      const lowWords = new Uint32Array(highList.width * highList.height * 4);
      restoreResource(lowList, () => lowList.setPixelBuffer(lowWords));
      unitLod = {
        selector,
        lists: [highList, lowList],
        words: [highWords, lowWords],
        fades: unitFades!,
        forced: -1,
        active: renderer.enabled
      };
      this.metrics.residentBytes += lowList.width * lowList.height * 16 + d.count * 8;
    }
    for (const target of [renderer, lodRenderer])
      this.entranceBindings.push({
        owner: d.ownerId,
        apply: entranceBinding(target.shaderData, this.root.transform.position.y)
      });
    this.draws.set(d.id, {
      ownerId: d.ownerId,
      pickIds: d.pickIds,
      pickId: d.pickId,
      rigidBindings: d.rigidBindings,
      objectBinding: d.objectBinding,
      renderer,
      lodRenderer,
      enabled: renderer.enabled,
      mesh,
      meshes,
      material,
      visibility,
      unitLod,
      resources
    });
  }
  bindRigidDecorations(resolve: (id: string) => Entity | undefined): void {
    for (const draw of this.draws.values()) {
      for (const renderer of [draw.renderer, draw.lodRenderer]) {
        if (draw.rigidBindings) (renderer as RigidDecorationRenderer).configure(draw.rigidBindings, resolve);
        else if (draw.objectBinding) (renderer as MountedDecorationRenderer).configure(draw.objectBinding, resolve);
      }
    }
  }
  /** Pure binding/coverage changes; templates, masks and feedback buffers stay shared. */
  setLod(level: 0 | 1) {
    this.setLodStates([{ lodIndex: level, signedFade: 1 }]);
    for (const d of this.draws.values()) if (d.unitLod) d.unitLod.forced = level;
    this.syncCamera?.();
  }
  setLodStates(states: readonly { lodIndex: number; signedFade: number }[]) {
    this.lodStates = states;
    const detail = states.filter((s) => s.lodIndex < 2);
    this.metrics.fullCoverage = detail.some((s) => s.lodIndex === 0);
    this.metrics.lod = detail[detail.length - 1]?.lodIndex ?? 1;
    for (const draw of this.draws.values()) {
      if (draw.unitLod) {
        const lod = draw.unitLod;
        lod.forced = -1;
        lod.active = draw.enabled && detail.length > 0;
        const fade = detail.length > 1 ? 1 : (detail[0]?.signedFade ?? 1);
        draw.renderer.mesh = draw.meshes[0];
        draw.mesh = draw.meshes[0];
        draw.lodRenderer.mesh = draw.meshes[1];
        draw.renderer.enabled = lod.active && lod.selector.highCount > 0;
        draw.lodRenderer.enabled = lod.active && lod.selector.lowCount > 0;
        draw.renderer.shaderData.setFloat("renderer_MasonryLodFade", fade);
        draw.lodRenderer.shaderData.setFloat("renderer_MasonryLodFade", fade);
        continue;
      }
      // Draws without a reduced mesh need only one submission when both unit LODs cross-fade.
      const same = draw.meshes.length === 1 && detail.length === 2;
      for (let i = 0; i < 2; i++) {
        const renderer = i === 0 ? draw.renderer : draw.lodRenderer;
        const state = detail[i];
        renderer.enabled = draw.enabled && !!state && !(same && i === 1);
        if (state) {
          const mesh = draw.meshes[Math.min(state.lodIndex, draw.meshes.length - 1)];
          if (renderer.mesh !== mesh) renderer.mesh = mesh;
          if (i === 0) draw.mesh = mesh;
          renderer.shaderData.setFloat("renderer_MasonryLodFade", same ? 1 : state.signedFade);
        }
      }
    }
    this.updateTriangleMetrics();
  }
  private updateTriangleMetrics() {
    let triangles = 0,
      full = 0,
      medium = 0;
    for (const d of this.draws.values())
      if (d.enabled) {
        if (d.renderer.enabled) triangles += (d.mesh.instanceCount * d.mesh.subMesh!.count) / 3;
        if (d.lodRenderer.enabled) {
          const mesh = d.lodRenderer.mesh as BufferMesh;
          triangles += (mesh.instanceCount * mesh.subMesh!.count) / 3;
        }
        const selected = d.unitLod?.selector.selection.length;
        full += ((selected ?? d.meshes[0].instanceCount) * d.meshes[0].subMesh!.count) / 3;
        const low = d.meshes[d.meshes.length - 1];
        medium += ((selected ?? low.instanceCount) * low.subMesh!.count) / 3;
      }
    this.metrics.triangles = triangles;
    this.metrics.fullTriangles = full;
    this.metrics.mediumTriangles = medium;
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.syncCamera = null;
    this.root.destroy();
    const release = () => {
      for (const r of this.resources.reverse()) r.destroy();
      for (const s of this.simulations) s.destroy();
      this.resources.length = this.simulations.length = 0;
      this.draws.clear();
      this.entranceBindings.length = 0;
      this.storageData.clear();
      this.viewData.clear();
      this.bufferCache.clear();
      this.storageCache.clear();
      this.textureCache.clear();
    };
    // Eviction can run inside Engine.update: wait for renderer references to
    // detach before destroying leased/owned buffers and materials.
    if (this.root.pendingDestroy) queueMicrotask(release);
    else release();
  }
}
