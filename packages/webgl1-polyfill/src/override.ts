import { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";

type Selector = (this: any) => boolean;
type Members = { target: Function; implementation: Function; when?: Selector };
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

interface Registry {
  devices: WeakMap<object, Invoke>;
  receivers: WeakMap<object, Invoke | null>;
}

const classes: Members[] = [];
const overwrites = new WeakMap<object, Set<PropertyKey>>();
const shadows = new WeakMap<object, Set<PropertyKey>>();
let registerDevice: ((device: WebGLGraphicDevice) => void) | undefined;

/**
 * Register WebGL1 replacements for an engine class.
 * @param target - Host class to override
 * @param when - Determines whether to use the replacement for a WebGL1 device
 * @returns The decorator for the replacement class
 */
export function Mixin(target: Function, when?: Selector): ClassDecorator {
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

export function installOverrides(): (device: WebGLGraphicDevice) => void {
  if (registerDevice) return registerDevice;

  const registry: Registry = { devices: new WeakMap(), receivers: new WeakMap() };
  const patches: Patch[] = [];
  const deviceDescriptors: PropertyDescriptorMap = Object.create(null);
  const replacements = new WeakMap<object, Map<PropertyKey, Replacement>>();

  function prepare(target: object, source: object, key: PropertyKey, when?: Selector): void {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    const onDevice = target === WebGLGraphicDevice.prototype && !when;
    const patch = prepareMember(registry, target, key, descriptor, onDevice);
    if (onDevice) {
      deviceDescriptors[key] = patch.replacement;
      return;
    }
    patches.push(patch);

    let members = replacements.get(target);
    if (!members) replacements.set(target, (members = new Map()));
    members.set(key, { descriptor, when });
  }

  for (const { target, implementation, when } of classes) {
    for (const field of shadows.get(implementation.prototype) ?? []) {
      if (
        Object.prototype.hasOwnProperty.call(implementation.prototype, field) ||
        overwrites.get(implementation.prototype)?.has(field)
      ) {
        throw new Error(`@Shadow must declare an existing instance field: ${String(field)}`);
      }
    }
    for (const key of overwrites.get(implementation.prototype) ?? []) {
      prepare(target.prototype, implementation.prototype, key, when);
    }
    for (const key of overwrites.get(implementation) ?? []) {
      prepare(target, implementation, key);
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

  const invoke: Invoke = (target, key, kind, original, receiver, args) => {
    const replacement = replacements.get(target)?.get(key);
    const method = replacement?.descriptor[kind];
    if (!method || (replacement?.when && !replacement.when.call(receiver))) return original.apply(receiver, args);
    return method.apply(receiver, args);
  };
  registerDevice = (device) => {
    Object.defineProperties(device, deviceDescriptors);
    registry.devices.set(device, invoke);
    registry.receivers = new WeakMap();
  };
  return registerDevice;
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
      const receivers = registry.receivers;
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
