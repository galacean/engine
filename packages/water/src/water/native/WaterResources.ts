import type { RiverDrop } from "../authoring/river/RiverDrop";
import {
  AssetPromise,
  Loader,
  ReferResource,
  Material,
  resourceLoader,
  type Engine,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import {
  computeWaterBodyAssetContentHash,
  createWaterBodyAsset,
  type WaterBodyAsset
} from "../authoring/body/WaterBodyAsset";
import { createImmutableWaterSnapshot } from "../authoring/identity/WaterImmutableSnapshot";
import { createWaterQualityPlanV2, type WaterQualityPlanV2 } from "../authoring/quality/WaterQualityPlan";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import { WaterBodyAssetRegistry } from "../runtime/body/WaterBodyAssetRegistry";
import { hashStableValue } from "../compiler/shared/determinism";
import { isOceanWaterCompiledTransferV1 } from "../runtime/ocean/OceanWaterCompiledResource";
import { copyWaterTerrainSnapshot, type WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import { resolveWaterMaterialLook, waterMaterialKey } from "./WaterMaterial";

/** Native resources own immutable authoring data, never compiled or scene-owned objects. */
abstract class WaterResource<T> extends ReferResource {
  name = "";
  readonly contentHash: string;
  protected readonly snapshot: Readonly<T>;
  protected constructor(engine: Engine, data: T, identity: (snapshot: T) => string = hashStableValue) {
    const snapshot = createImmutableWaterSnapshot(data);
    super(engine);
    this.snapshot = snapshot;
    this.contentHash = identity(snapshot);
  }
  get data(): Readonly<T> {
    return createImmutableWaterSnapshot(this.snapshot);
  }
}

export class WaterBodyResource extends WaterResource<WaterBodyAsset> {
  private preparedOcean?: { data: unknown; hash: string };

  /** @internal Owned compiler cache for staging only; author data and saved files exclude it. */
  runtimeData(): Readonly<WaterBodyAsset> {
    const data = this.data;
    return this.preparedOcean
      ? createWaterBodyAsset({
          ...data,
          representationData: createImmutableWaterSnapshot(this.preparedOcean.data),
          representationDataHash: this.preparedOcean.hash
        })
      : data;
  }

  protected override _onDestroy(): void {
    this.preparedOcean = undefined;
    super._onDestroy();
  }

  /** Read-only scalar metadata; querying a kind must not copy terrain/source buffers. */
  get kind(): WaterBodyAsset["kind"] {
    return this.snapshot.kind;
  }

  get riverDrops(): readonly RiverDrop[] {
    const source = this.snapshot.source as { descriptor?: { drops?: readonly RiverDrop[] } };
    return this.kind === "river" ? createImmutableWaterSnapshot(source.descriptor?.drops ?? []) : [];
  }

  constructor(engine: Engine, data: WaterBodyAsset) {
    const registry = new WaterBodyAssetRegistry();
    // Prepared Ocean transfers are derived caches; the source descriptor rebuilds them.
    const derivedOcean =
      (data.representationData as { kind?: string } | undefined)?.kind === "ocean-water-compiled-transfer-v1";
    const asset = createWaterBodyAsset(
      derivedOcean ? { ...data, representationData: undefined, representationDataHash: undefined } : data
    );
    registry.registerAsset(asset);
    super(engine, registry.getAsset(asset.id)!, computeWaterBodyAssetContentHash);
    if (derivedOcean && isOceanWaterCompiledTransferV1(data.representationData))
      this.preparedOcean = {
        data: createImmutableWaterSnapshot(data.representationData),
        hash: data.representationDataHash!
      };
    this.name = asset.id;
  }
}

/** Internal immutable compiler input for runtime API callers without a native Material. */
export class WaterLookResource extends WaterResource<WaterLookAuthoringComponents> {
  constructor(engine: Engine, data: WaterLookAuthoringComponents) {
    const registry = new WaterBodyAssetRegistry();
    installLook(registry, data);
    super(engine, registry.getLookAuthoringSnapshot(data.look.id)!);
    this.name = data.look.id;
  }
}

export class WaterQualityResource extends WaterResource<WaterQualityPlanV2> {
  constructor(engine: Engine, data: WaterQualityPlanV2) {
    super(engine, createWaterQualityPlanV2(data));
    this.name = data.id;
  }
}

/** Explicit manual bed input. Host-generated Terrain snapshots remain runtime inputs. */
export class WaterTerrainResource extends WaterResource<WaterTerrainSnapshot> {
  constructor(engine: Engine, data: WaterTerrainSnapshot) {
    super(engine, copyWaterTerrainSnapshot(data));
    this.name = data.id;
  }
}

export function installLook(registry: WaterBodyAssetRegistry, data: WaterLookAuthoringComponents): void {
  registry.registerAppearancePreset(data.appearance);
  registry.registerOpticsPreset(data.optics);
  registry.registerReflectionPolicyPreset(data.reflectionPolicy);
  registry.registerRenderStatePreset(data.renderState);
  registry.registerLookPreset(data.look);
}

/** Namespace private revisions so editing one instance never mutates another shared Look. */
export function scopedLook(resource?: WaterLookResource, material?: Material): WaterLookAuthoringComponents {
  const data = material ? resolveWaterMaterialLook(material) : resource?.data;
  if (!data) throw new TypeError("Water requires a native Material or runtime Look input.");
  const id = `native-look:${material ? waterMaterialKey(material) : resource!.contentHash}`;
  return {
    appearance: {
      ...data.appearance,
      id: `${id}:appearance`,
      appearance: { ...data.appearance.appearance, id: `${id}:surface` }
    },
    optics: { ...data.optics, id: `${id}:optics` },
    reflectionPolicy: { ...data.reflectionPolicy, id: `${id}:reflection` },
    renderState: { ...data.renderState, id: `${id}:render` },
    look: {
      ...data.look,
      id,
      appearanceAssetId: `${id}:surface`,
      opticalProfileId: `${id}:optics`,
      reflectionPolicyId: `${id}:reflection`,
      renderStatePresetId: `${id}:render`
    }
  };
}

export type WaterResourceFile =
  | { version: 1; kind: "body"; data: WaterBodyAsset }
  | { version: 1; kind: "quality"; data: WaterQualityPlanV2 }
  | { version: 1; kind: "terrain"; data: WaterTerrainSnapshot };

/** Resource payload only; Entity/Component/Scene references use the engine's existing schema. */
export function serializeWaterResource(
  resource: WaterBodyResource | WaterQualityResource | WaterTerrainResource
): string {
  return stringifyWaterData({
    version: 1,
    kind:
      resource instanceof WaterBodyResource ? "body" : resource instanceof WaterTerrainResource ? "terrain" : "quality",
    data: resource.data
  });
}

export function stringifyWaterData(data: unknown): string {
  return JSON.stringify(data, (_key, value) => {
    if (ArrayBuffer.isView(value))
      return { $waterArray: value.constructor.name, values: Array.from(value as unknown as ArrayLike<number>) };
    if (typeof value === "number" && !Number.isFinite(value))
      throw new TypeError("Water resource numbers must be finite.");
    return value;
  });
}

export function parseWaterData(text: string): unknown {
  const arrays = {
    Float32Array,
    Float64Array,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array
  };
  return JSON.parse(text, (_key, value) => {
    if (value && typeof value === "object" && "$waterArray" in value) {
      if (
        !Object.hasOwn(arrays, value.$waterArray) ||
        !Array.isArray(value.values) ||
        value.values.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))
      )
        throw new TypeError("Invalid Water array.");
      return new arrays[value.$waterArray as keyof typeof arrays](value.values);
    }
    return value;
  });
}

export function parseWaterResource(
  engine: Engine,
  text: string
): WaterBodyResource | WaterQualityResource | WaterTerrainResource {
  const file = parseWaterData(text) as WaterResourceFile;
  if (file?.version !== 1) throw new RangeError("Unsupported Water resource version.");
  switch (file.kind) {
    case "body":
      return new WaterBodyResource(engine, file.data);
    case "quality":
      return new WaterQualityResource(engine, file.data);
    case "terrain":
      return new WaterTerrainResource(engine, file.data);
    default:
      throw new TypeError("Unsupported Water resource kind.");
  }
}

export class WaterResourceLoader extends Loader<ReferResource> {
  load(item: LoadItem, manager: ResourceManager): AssetPromise<ReferResource> {
    return new AssetPromise((resolve, reject, _complete, _detail, onCancel) => {
      let cancelled = false;
      // Engine Loader extension point, matching built-in loaders.
      const request = (manager as unknown as { _request(url: string, config: unknown): AssetPromise<string> })._request(
        item.url!,
        { ...item, type: "text" }
      );
      onCancel?.(() => {
        cancelled = true;
        request.cancel?.();
      });
      request
        .then((text) => {
          if (cancelled) return;
          if (manager.engine.destroyed)
            reject?.(new DOMException("Engine was destroyed during Water loading.", "AbortError"));
          else resolve(parseWaterResource(manager.engine, text));
        })
        .catch((error) => reject?.(error));
    });
  }
}

let registered = false;
export function registerWaterResourceLoader(): void {
  if (registered) return;
  registered = true;
  resourceLoader("WaterResource", ["water"], true)(WaterResourceLoader);
}
