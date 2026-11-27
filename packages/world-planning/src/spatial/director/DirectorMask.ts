import type { DirectorSemanticReport } from "./DirectorSemantic";
import { compilePlanningScene, type PlanningScenePart } from "../../semantic-study/WorldPlanningScene";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { Observer } from "../guidance/VisibilityQuery";
export type VisualRole = "push" | "pull" | "cue";
export type RoleMap = Record<string, VisualRole>;
export interface PixelMeasurement {
  push: number;
  pull: number;
  cue: number;
  projectedPull: number;
  occlusion: number | null;
  contributions: Record<string, number>;
  blockers?: Record<string, number>;
  pixels: number;
  width: number;
  height: number;
}
export type ColorGroup = "red" | "blue" | "green";
export type ColorAssignments = Record<string, ColorGroup>;
export interface ObjectPixelMeasurement {
  version: 2;
  /** Engine-native composition evidence for current reports; absent in historical v2 fixtures. */
  semantic?: DirectorSemanticReport;
  /** Actual per-frame object colours, including automatically detected occluders. */
  colors?: ColorAssignments;
  groups: Record<ColorGroup, number>;
  visibleTarget: number;
  projectedTarget: number;
  occlusion: number | null;
  contributions: Record<string, number>;
  blockers?: Record<string, number>;
  pixels: number;
  width: number;
  height: number;
}
const COLORS = { red: [255, 0, 0], blue: [0, 0, 255], green: [0, 255, 0] };
/** Colour membership and target membership are independent, arbitrary object-ID sets. */
export function countObjectPixels(
  ids: Uint32Array,
  owners: readonly string[],
  colors: ColorAssignments,
  targets: ReadonlySet<string>,
  projectedPixels: number,
  width: number,
  height: number,
  terrainProjection?: Uint8Array
): ObjectPixelMeasurement {
  const groups = { red: 0, blue: 0, green: 0 },
    contributions: Record<string, number> = {};
  let visible = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const owner = owners[id];
    if (!owner) continue;
    contributions[owner] = (contributions[owner] ?? 0) + 1;
    const color = colors[owner] ?? (owner === "terrain" && terrainProjection?.[i] ? "red" : undefined);
    if (color) groups[color]++;
    if (targets.has(owner)) visible++;
  }
  const pixels = width * height;
  return {
    version: 2,
    groups: { red: groups.red / pixels, blue: groups.blue / pixels, green: groups.green / pixels },
    visibleTarget: visible / pixels,
    projectedTarget: projectedPixels / pixels,
    occlusion: projectedPixels ? Math.max(0, 1 - visible / projectedPixels) : null,
    contributions,
    pixels,
    width,
    height
  };
}
const omitted = new Set([
  "labels",
  "ports",
  "sight",
  "spawn",
  "obb",
  "group",
  "components",
  "entrance",
  "teleport",
  "furniture",
  "route",
  "road-world",
  "road-local"
]);
/** Exact visible-pixel counters at the declared resolution. Unlabelled geometry still writes depth. */
export function countRolePixels(
  ids: Uint32Array,
  owners: readonly string[],
  roles: RoleMap,
  projectedPixels: number,
  width: number,
  height: number
): PixelMeasurement {
  const contributions: Record<string, number> = {},
    counts = { push: 0, pull: 0, cue: 0 };
  for (const id of ids) {
    const owner = owners[id];
    if (!owner) continue;
    contributions[owner] = (contributions[owner] ?? 0) + 1;
    const role = roles[owner];
    if (role) counts[role]++;
  }
  const total = width * height;
  return {
    ...(Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / total])) as Record<VisualRole, number>),
    projectedPull: projectedPixels / total,
    occlusion: projectedPixels ? Math.max(0, 1 - counts.pull / projectedPixels) : null,
    contributions,
    pixels: total,
    width,
    height
  };
}
/** Independent unlit object-ID pass. The editor supplies production Terrain depth explicitly.
 * No gamma, lighting, blending, MSAA, editor visibility or selection enters the measurement.
 */
export class DirectorMask {
  readonly canvas = document.createElement("canvas");
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private depthProgram: WebGLProgram;
  private terrainTexture: WebGLTexture;
  private terrainId = 0;
  private hasTerrainDepth = false;
  private items: {
    owner: string;
    layer: string;
    id: number;
    vao: WebGLVertexArrayObject;
    position: WebGLBuffer;
    index: WebGLBuffer;
    count: number;
  }[] = [];
  private owners = [""];
  private plan?: IslandPlan;
  private pixels: Uint8Array;
  private ids: Uint32Array;
  private lastColors: ColorAssignments = {};
  private terrainProjection?: Uint8Array;
  constructor(
    readonly width = 320,
    readonly height = 180
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("导演像素测试需要WebGL2");
    this.gl = gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!);
      return s;
    };
    const vs = shader(
      gl.VERTEX_SHADER,
      `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPosition;
  uniform vec3 uEye;uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;uniform vec2 uScale;
  void main(){vec3 p=aPosition-uEye;float z=dot(p,uForward);float n=.1;float f=12000.;gl_Position=vec4(dot(p,uRight)*uScale.x,dot(p,uUp)*uScale.y,(f+n)/(f-n)*z-2.*f*n/(f-n),z);}`
    );
    const fs = shader(
      gl.FRAGMENT_SHADER,
      `#version 300 es
  precision highp float;uniform vec3 uId;out vec4 color;void main(){color=vec4(uId,1.);}`
    );
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    const dvs = shader(
      gl.VERTEX_SHADER,
      `#version 300 es
      void main(){vec2 p=vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2));gl_Position=vec4(p*2.-1.,0.,1.);}`
    );
    const dfs = shader(
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;uniform sampler2D uDepth;uniform vec3 uId;out vec4 color;
      void main(){vec4 p=texelFetch(uDepth,ivec2(gl_FragCoord.xy),0);if(p.a<.5 || all(lessThan(p.rgb,vec3(.5/255.))))discard;
      vec3 b=floor(p.rgb*255.+.5);float z=dot(b,vec3(1.,256.,65536.))/16777215.*12000.;
      float n=.1;float f=12000.;gl_FragDepth=.5*((f+n)/(f-n)-2.*f*n/((f-n)*max(z,n)))+.5;color=vec4(uId,1.);}`
    );
    this.depthProgram = gl.createProgram()!;
    gl.attachShader(this.depthProgram, dvs);
    gl.attachShader(this.depthProgram, dfs);
    gl.linkProgram(this.depthProgram);
    if (!gl.getProgramParameter(this.depthProgram, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.depthProgram)!);
    gl.deleteShader(dvs);
    gl.deleteShader(dfs);
    this.terrainTexture = gl.createTexture()!;

    this.pixels = new Uint8Array(width * height * 4);
    this.ids = new Uint32Array(width * height);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }
  /** Upload once per published world revision, not once per sample. */
  setPlan(plan: IslandPlan) {
    if (this.plan === plan) return;
    this.setParts(compilePlanningScene(plan));
    this.plan = plan;
  }
  /** Also used by geometry calibration fixtures. Helpers are deliberately absent. */
  setParts(parts: PlanningScenePart[]) {
    this.clear();
    const gl = this.gl,
      owners = new Map<string, number>();
    for (const part of parts) {
      if (part.pickOnly || part.selectionOnly || part.lines || omitted.has(part.layer)) continue;
      let id = owners.get(part.id);
      if (!id) {
        id = this.owners.length;
        owners.set(part.id, id);
        this.owners.push(part.id);
      }
      const vao = gl.createVertexArray()!,
        position = gl.createBuffer()!,
        index = gl.createBuffer()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(part.mesh.positions), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(part.mesh.indices), gl.STATIC_DRAW);
      this.items.push({ owner: part.id, layer: part.layer, id, vao, position, index, count: part.mesh.indices.length });
    }
    gl.bindVertexArray(null);
  }
  /** Depth captured from the actual Terrain renderer, at this exact camera and viewport. */
  setTerrainDepth(pixels: Uint8Array): void {
    if (pixels.length !== this.width * this.height * 4) throw new Error("Terrain 诊断分辨率不匹配");
    const gl = this.gl;
    if (!this.terrainId) {
      this.terrainId = this.owners.length;
      this.owners.push("terrain");
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.hasTerrainDepth = true;
  }
  private render(observer: Observer, only?: ReadonlySet<string>) {
    const gl = this.gl,
      p = this.program;
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.hasTerrainDepth && (!only || only.has("terrain"))) {
      const dp = this.depthProgram,
        id = this.terrainId;
      gl.useProgram(dp);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
      gl.uniform1i(gl.getUniformLocation(dp, "uDepth"), 0);
      gl.uniform3f(
        gl.getUniformLocation(dp, "uId"),
        (id & 255) / 255,
        ((id >> 8) & 255) / 255,
        ((id >> 16) & 255) / 255
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.useProgram(p);
    const f = observer.forward,
      n = Math.hypot(f.x, f.y, f.z),
      h = Math.hypot(f.x, f.z);
    if (n < 1e-8 || h < 1e-8) throw new Error("无效观察朝向");
    const forward = [f.x / n, f.y / n, f.z / n],
      right = [-f.z / h, 0, f.x / h],
      up = [-forward[1] * right[2], forward[0] * right[2] - forward[2] * right[0], forward[1] * right[0]];
    gl.uniform3f(gl.getUniformLocation(p, "uEye"), observer.position.x, observer.position.y, observer.position.z);
    gl.uniform3fv(gl.getUniformLocation(p, "uForward"), forward);
    gl.uniform3fv(gl.getUniformLocation(p, "uRight"), right);
    gl.uniform3fv(gl.getUniformLocation(p, "uUp"), up);
    const t = Math.tan((observer.verticalFovDegrees * Math.PI) / 360);
    gl.uniform2f(gl.getUniformLocation(p, "uScale"), 1 / ((t * this.width) / this.height), 1 / t);
    const color = gl.getUniformLocation(p, "uId");
    for (const item of this.items) {
      if ((only && !only.has(item.owner)) || (this.hasTerrainDepth && item.layer === "land")) continue;
      gl.uniform3f(color, (item.id & 255) / 255, ((item.id >> 8) & 255) / 255, ((item.id >> 16) & 255) / 255);
      gl.bindVertexArray(item.vao);
      gl.drawElements(gl.TRIANGLES, item.count, gl.UNSIGNED_INT, 0);
    }
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("GPU像素读取失败");
    for (let i = 0; i < this.ids.length; i++)
      this.ids[i] = this.pixels[i * 4] | (this.pixels[i * 4 + 1] << 8) | (this.pixels[i * 4 + 2] << 16);
  }
  /** Visible union plus an independent target-only projection; zero projection stays unknown. */
  measureObjects(
    observer: Observer,
    colors: ColorAssignments,
    targets: ReadonlySet<string>,
    automaticBlockers = false
  ): ObjectPixelMeasurement {
    this.render(observer, targets);
    let projected = 0;
    for (const id of this.ids) if (id) projected++;
    const projection = new Uint8Array(this.ids.length);
    for (let i = 0; i < projection.length; i++) projection[i] = this.ids[i] ? 1 : 0;
    this.render(observer);
    const blockers: Record<string, number> = {};
    for (let i = 0; i < projection.length; i++)
      if (projection[i] && !targets.has(this.owners[this.ids[i]])) {
        const owner = this.owners[this.ids[i]] || "background";
        blockers[owner] = (blockers[owner] ?? 0) + 1;
      }
    this.lastColors = { ...colors };
    this.terrainProjection = automaticBlockers ? projection : undefined;
    if (automaticBlockers)
      for (const owner of Object.keys(blockers))
        if (owner !== "terrain" && owner !== "background" && !this.lastColors[owner]) this.lastColors[owner] = "red";
    return {
      ...countObjectPixels(
        this.ids,
        this.owners,
        this.lastColors,
        targets,
        projected,
        this.width,
        this.height,
        this.terrainProjection
      ),
      colors: this.lastColors,
      blockers
    };
  }
  /** Legacy v1 report compatibility only; the editor uses measureObjects and no design roles. */
  measure(observer: Observer, roles: RoleMap): PixelMeasurement {
    const mapping = { push: "red", pull: "blue", cue: "green" } as const;
    const colors = Object.fromEntries(Object.entries(roles).map(([id, role]) => [id, mapping[role]]));
    const m = this.measureObjects(observer, colors, new Set(Object.keys(roles).filter((id) => roles[id] === "pull")));
    return {
      push: m.groups.red,
      pull: m.groups.blue,
      cue: m.groups.green,
      projectedPull: m.projectedTarget,
      occlusion: m.occlusion,
      contributions: m.contributions,
      blockers: m.blockers,
      pixels: m.pixels,
      width: m.width,
      height: m.height
    };
  }
  /** Display measured ID colors; optionally preserve the underlying scene for unmarked pixels. */
  image(transparentUnmarked = false): ImageData {
    const rgba = new Uint8ClampedArray(this.width * this.height * 4);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const source = (this.height - 1 - y) * this.width + x,
          id = this.ids[source],
          role =
            this.lastColors[this.owners[id]] ??
            (this.owners[id] === "terrain" && this.terrainProjection?.[source] ? "red" : undefined),
          color = role ? COLORS[role] : id ? [70, 70, 70] : [0, 0, 0],
          i = (y * this.width + x) * 4;
        rgba[i] = color[0];
        rgba[i + 1] = color[1];
        rgba[i + 2] = color[2];
        rgba[i + 3] = transparentUnmarked && !role ? 0 : 255;
      }
    return new ImageData(rgba, this.width, this.height);
  }
  private clear() {
    const gl = this.gl;
    for (const i of this.items) {
      gl.deleteVertexArray(i.vao);
      gl.deleteBuffer(i.position);
      gl.deleteBuffer(i.index);
    }
    this.items = [];
    this.owners = [""];
    this.plan = undefined;
    this.hasTerrainDepth = false;
    this.terrainId = 0;
  }
  dispose() {
    this.clear();
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.depthProgram);
    this.gl.deleteTexture(this.terrainTexture);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
