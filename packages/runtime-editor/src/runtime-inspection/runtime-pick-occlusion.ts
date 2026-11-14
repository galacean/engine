import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  Material,
  Renderer,
  Shader,
  ShaderPass,
  ShaderProperty,
  SubShader,
  RenderStateElementKey as State,
  type Camera
} from "@galacean/engine";

// Keep this Engine pass bridge here: the original instructions preserve arbitrary
// deformation, discard and gl_FragDepth. A generic replacement vertex shader cannot.
type Pass = {
  name: string;
  _vertexShaderInstructions: ConstructorParameters<typeof ShaderPass>[1];
  _fragmentShaderInstructions: ConstructorParameters<typeof ShaderPass>[2];
  _platformTarget: ConstructorParameters<typeof ShaderPass>[3];
  _renderState: any;
  _renderStateDataMap: Record<number, ShaderProperty>;
  _tagsMap: Record<number, string | number | boolean>;
};
const variants = new WeakMap<Shader, { shader: Shader; masks: ShaderProperty[][] }>();
let serial = 0;

const occlusionPasses = new WeakSet<ShaderPass>();
export const isPickOcclusionPass = (pass: ShaderPass): boolean => occlusionPasses.has(pass);
const passVariants = new WeakMap<ShaderPass, { pass: ShaderPass; mask: ShaderProperty }>();
/** Shared by preparation and capture; preserves the original shader's deformation/coverage. */
export function pickOcclusionPass(original: ShaderPass) {
  const cached = passVariants.get(original);
  if (cached) return cached;
  const src = original as unknown as Pass;
  const output = new ShaderPass(
    src.name,
    src._vertexShaderInstructions,
    src._fragmentShaderInstructions,
    src._platformTarget
  );
  const dst = output as unknown as Pass;
  dst._tagsMap = { ...src._tagsMap };
  dst._renderStateDataMap = { ...src._renderStateDataMap };
  const state = dst._renderState,
    prior = src._renderState;
  for (const key of ["depthState", "rasterState", "stencilState"]) Object.assign(state[key], prior[key]);
  state.renderQueueType = prior.renderQueueType;
  // Passing fragments write ID zero regardless of their original shaded color.
  // Do not change geometry, depth rules, queue order or stencil coverage.
  for (const key of [
    State.BlendStateEnabled0,
    State.BlendStateColorBlendOperation0,
    State.BlendStateAlphaBlendOperation0,
    State.BlendStateSourceColorBlendFactor0,
    State.BlendStateDestinationColorBlendFactor0,
    State.BlendStateSourceAlphaBlendFactor0,
    State.BlendStateDestinationAlphaBlendFactor0,
    State.BlendStateAlphaToCoverage
  ])
    delete dst._renderStateDataMap[key];
  Object.assign(state.blendState.targetBlendState, {
    enabled: true,
    colorBlendOperation: BlendOperation.Add,
    alphaBlendOperation: BlendOperation.Add,
    sourceColorBlendFactor: BlendFactor.Zero,
    destinationColorBlendFactor: BlendFactor.Zero,
    sourceAlphaBlendFactor: BlendFactor.Zero,
    destinationAlphaBlendFactor: BlendFactor.Zero
  });
  const mask = ShaderProperty.getByName(`material_PickOcclusionMask_${++serial}`);
  dst._renderStateDataMap[State.BlendStateColorWriteMask0] = mask;
  const result = { pass: output, mask };
  passVariants.set(original, result);
  occlusionPasses.add(output);
  return result;
}

function variant(source: Shader) {
  const cached = variants.get(source);
  if (cached && !cached.shader.destroyed) return cached;
  const masks: ShaderProperty[][] = [];
  const subShaders = source.subShaders.map((sub, subIndex) => {
    masks[subIndex] = [];
    const passes = sub.passes.map((original, index) => {
      const derived = pickOcclusionPass(original);
      masks[subIndex][index] = derived.mask;
      return derived.pass;
    });
    const result = new SubShader(sub.name, passes);
    (result as unknown as { _tagsMap: Pass["_tagsMap"] })._tagsMap = { ...(sub as unknown as Pass)._tagsMap };
    return result;
  });
  const result = { shader: Shader.create(`RuntimePickOcclusion_${++serial}`, subShaders)!, masks };
  variants.set(source, result);
  return result;
}

/** Unregistered surfaces still occlude IDs in the same draw, without a scene prepass. */
export class RuntimePickOcclusion {
  private readonly saved: { renderer: Renderer; materials: (Material | null)[] }[] = [];
  private readonly materials = new Map<Material, Material>();

  prepare(camera: Camera, registered: ReadonlySet<Renderer>): void {
    for (const root of camera.scene!.rootEntities) {
      for (const renderer of root.getComponentsIncludeChildren(Renderer, [])) {
        if (
          registered.has(renderer) ||
          !renderer.enabled ||
          !renderer.entity.isActiveInHierarchy ||
          !(renderer.entity.layer & camera.cullingMask)
        )
          continue;
        const originals = renderer.getMaterials().slice();
        this.saved.push({ renderer, materials: originals });
        renderer.setMaterials(originals.map((source) => (source ? this.material(source) : source)));
      }
    }
  }

  private material(source: Material): Material {
    const cached = this.materials.get(source);
    if (cached) return cached;
    const derived = variant(source.shader),
      copy = source.clone();
    this.materials.set(source, copy);
    copy.shader = derived.shader;
    source.shader.subShaders.forEach((sub, si) =>
      sub.passes.forEach((original, pi) => {
        const pass = original as unknown as Pass;
        const value = (key: State, fallback: boolean) => {
          const property = pass._renderStateDataMap[key];
          return property ? (source.shaderData.getFloat(property) ?? 1) !== 0 : fallback;
        };
        const depth = pass._renderState.depthState;
        // Non-depth-writing transparent effects were not occluders in the old depth
        // prepass either. They must not erase identities by writing black on top.
        const writesDepth =
          value(State.DepthStateEnabled, depth.enabled) && value(State.DepthStateWriteEnabled, depth.writeEnabled);
        copy.shaderData.setFloat(derived.masks[si][pi], writesDepth ? ColorWriteMask.All : ColorWriteMask.None);
      })
    );
    return copy;
  }

  restore(): void {
    for (const { renderer, materials } of this.saved) renderer.setMaterials(materials);
    this.saved.length = 0;
    for (const material of this.materials.values()) material.destroy();
    this.materials.clear();
  }
}
