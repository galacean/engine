import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";

type Core = Pick<
  typeof import("@galacean/engine-core"),
  | "Engine"
  | "AmbientOcclusion"
  | "SkinnedMeshRenderer"
  | "InheritVelocityModule"
  | "NoiseModule"
  | "LimitVelocityOverLifetimeModule"
  | "ParticleInheritVelocityMode"
  | "ParticleSimulationSpace"
  | "ShaderPass"
  | "ShaderMacro"
  | "ShaderFactory"
  | "BasicRenderPipeline"
  | "Camera"
  | "CameraClearFlags"
  | "MeshRenderer"
  | "ModelMesh"
  | "BlendShapeManager"
  | "Texture"
  | "Texture2D"
  | "TextureUtils"
  | "TextureFormat"
  | "TextureFilterMode"
  | "TextureWrapMode"
  | "PrimitiveMesh"
  | "Logger"
  | "GLCapabilityType"
  | "ParticleGenerator"
  | "ParticleRenderer"
  | "VelocityOverLifetimeModule"
  | "SubEmittersModule"
  | "CascadedShadowCasterPass"
  | "ShaderProgram"
  | "BasicResources"
  | "FontAtlas"
  | "DepthOnlyPass"
  | "ShaderMacroProcessor"
  | "PipelineUtils"
>;
type RHI = Pick<
  typeof import("@galacean/engine-rhi-webgl"),
  "WebGLGraphicDevice" | "GLPrimitive" | "GLCapability" | "GLExtensions" | "GLRenderStates" | "GLTexture"
>;
export type Bindings = Core & RHI & Pick<typeof import("@galacean/engine-math"), "MathUtil">;
type Target = keyof Bindings;
type Selector = (this: any) => boolean;
type Members = { target: Target; implementation: Function; when?: Selector };
type Patch = {
  target: object;
  key: PropertyKey;
  original: PropertyDescriptor;
  replacement: PropertyDescriptor;
};
type MemberKind = "value" | "get" | "set";
type Invoke = (
  target: object,
  key: PropertyKey,
  kind: MemberKind,
  original: Function,
  receiver: unknown,
  args: IArguments
) => unknown;
type Replacement = { descriptor: PropertyDescriptor; when?: Selector };

export interface Registry {
  devices: WeakMap<object, Invoke>;
  installedMembers: WeakMap<object, Set<PropertyKey>>;
  receivers?: WeakMap<object, Invoke | null>;
}

const classes: Members[] = [];
const overwrites = new WeakMap<object, Set<PropertyKey>>();
const shadows = new WeakMap<object, Set<PropertyKey>>();
let defaultRegistry: Registry | undefined;

/** Register a class containing WebGL1 replacements for the named engine class. */
export function Mixin(target: Target, when?: Selector): ClassDecorator {
  return (implementation) => {
    classes.push({ target, implementation, when });
  };
}

/** Mark an existing method or accessor for replacement. */
export function Overwrite(target: object, key: PropertyKey, _descriptor: PropertyDescriptor): void {
  let members = overwrites.get(target);
  if (!members) overwrites.set(target, (members = new Set()));
  members.add(key);
}

/** Declare an existing instance field. Its storage belongs to the original engine instance. */
export function Shadow(target: object, key: PropertyKey): void {
  let fields = shadows.get(target);
  if (!fields) shadows.set(target, (fields = new Set()));
  fields.add(key);
}

export function bindOverrides(
  bindings: Bindings,
  registry: Registry = (defaultRegistry ??= { devices: new WeakMap(), installedMembers: new WeakMap() })
): (device: WebGLGraphicDevice) => void {
  const { devices, installedMembers } = registry;
  registry.receivers ??= new WeakMap();
  const patches: Patch[] = [];
  const deviceDescriptors: PropertyDescriptorMap = Object.create(null);
  const replacements = new WeakMap<object, Map<PropertyKey, Replacement>>();

  function prepare(target: object, source: object, key: PropertyKey, when?: Selector): void {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    const onDevice = target === bindings.WebGLGraphicDevice.prototype && !when;
    const patch = prepareMember(registry, target, key, descriptor, onDevice);
    if (onDevice) {
      deviceDescriptors[key] = patch.replacement;
      return;
    }
    if (!installedMembers.get(target)?.has(key)) patches.push(patch);

    let members = replacements.get(target);
    if (!members) replacements.set(target, (members = new Map()));
    members.set(key, { descriptor, when });
  }

  for (const { target, implementation, when } of classes) {
    const original = bindings[target];
    if (typeof original !== "function") throw new Error(`Incompatible engine class: ${target}`);

    for (const field of shadows.get(implementation.prototype) ?? []) {
      if (
        Object.prototype.hasOwnProperty.call(implementation.prototype, field) ||
        overwrites.get(implementation.prototype)?.has(field)
      ) {
        throw new Error(`@Shadow must declare an existing instance field: ${String(field)}`);
      }
    }
    for (const key of overwrites.get(implementation.prototype) ?? []) {
      prepare(original.prototype, implementation.prototype, key, when);
    }
    for (const key of overwrites.get(implementation) ?? []) {
      prepare(original, implementation, key);
    }
  }

  let applied = 0;
  try {
    for (const { target, key, replacement } of patches) {
      Object.defineProperty(target, key, replacement);
      applied++;
    }
  } catch (error) {
    for (let index = applied - 1; index >= 0; index--) {
      const { target, key, original } = patches[index];
      Object.defineProperty(target, key, original);
    }
    throw error;
  }

  for (const { target, key } of patches) {
    let members = installedMembers.get(target);
    if (!members) installedMembers.set(target, (members = new Set()));
    members.add(key);
  }
  const invoke: Invoke = (target, key, kind, original, receiver, args) => {
    const replacement = replacements.get(target)?.get(key);
    const method = replacement?.descriptor[kind];
    if (!method || (replacement?.when && !replacement.when.call(receiver))) return original.apply(receiver, args);
    return method.apply(receiver, args);
  };
  return (device) => {
    Object.defineProperties(device, deviceDescriptors);
    devices.set(device, invoke);
    registry.receivers = new WeakMap();
  };
}

function owningDevice(value: any): object | undefined {
  return (
    value?._camera?.engine?._hardwareRenderer ??
    value?._hardwareRenderer ??
    value?._rhi ??
    value?.rhi ??
    value?._engine?._hardwareRenderer ??
    value?.engine?._hardwareRenderer ??
    value?._primitive?.engine?._hardwareRenderer ??
    value?._generator?._renderer?.engine?._hardwareRenderer ??
    value?._renderer?.engine?._hardwareRenderer ??
    value?._scene?.engine?._hardwareRenderer ??
    value
  );
}

function prepareMember(
  registry: Registry,
  target: object,
  key: PropertyKey,
  replacement: PropertyDescriptor,
  onDevice: boolean
): Patch {
  const original = Object.getOwnPropertyDescriptor(target, key);
  if (!original?.configurable) throw new Error(`Incompatible engine member: ${String(key)}`);

  const descriptor = { ...original };
  for (const kind of ["value", "get", "set"] as const) {
    const method = replacement[kind];
    if (!method) continue;
    const previous = original[kind];
    if (typeof method !== "function" || typeof previous !== "function") {
      throw new Error(`Incompatible engine ${kind}: ${String(key)}`);
    }
    if (onDevice) {
      descriptor[kind] = method;
      continue;
    }
    descriptor[kind] = function () {
      const receivers = registry.receivers!;
      let invoke = receivers.get(this);
      if (invoke === undefined) {
        const owner = owningDevice(this);
        invoke = registry.devices.get(owner!);
        if (owner !== this) {
          // Cache the dispatcher without retaining the device after its owner is destroyed.
          if (invoke || (owner as WebGLGraphicDevice | undefined)?.isWebGL2) receivers.set(this, (invoke ??= null));
        } else if (!invoke) {
          // Shared shader passes and static methods can receive different devices on each call.
          for (let index = 0; index < arguments.length; index++) {
            invoke = registry.devices.get(owningDevice(arguments[index])!);
            if (invoke) break;
          }
        }
      }
      return invoke ? invoke(target, key, kind, previous, this, arguments) : previous.apply(this, arguments);
    };
  }
  return { target, key, original, replacement: descriptor };
}
