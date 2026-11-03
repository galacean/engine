import { AssetType, type Engine, Texture2D, TextureWrapMode } from "@galacean/engine";

const url = new URL("../../assets/river-bed/farmlands-river-sand.png", import.meta.url).href;
interface Entry {
  texture: Promise<Texture2D>;
  owners: number;
}
const entries = new WeakMap<Engine, Entry>();
export interface PlanningRiverBedLease {
  readonly texture: Texture2D;
  release(): void;
}

/** Candidate and accepted Terrain share one Engine-local appearance lease. */
export async function acquirePlanningRiverBed(engine: Engine): Promise<PlanningRiverBedLease> {
  let entry = entries.get(engine);
  if (!entry) {
    entry = {
      texture: (async () =>
        await engine.resourceManager.load<Texture2D>({
          type: AssetType.Texture,
          url,
          params: { isSRGBColorSpace: true, mipmap: true }
        }))(),
      owners: 0
    };
    entries.set(engine, entry);
  }
  entry.owners++;
  const owner = entry;
  let texture: Texture2D;
  try {
    texture = await owner.texture;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
    texture.isGCIgnored = true;
  } catch (error) {
    if (--owner.owners === 0 && entries.get(engine) === owner) entries.delete(engine);
    throw error;
  }
  let active = true;
  return {
    texture,
    release() {
      if (!active) return;
      active = false;
      if (--owner.owners === 0) {
        if (entries.get(engine) === owner) entries.delete(engine);
        texture.destroy(true);
      }
    }
  };
}
