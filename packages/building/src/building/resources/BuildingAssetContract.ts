import { decorationTextureBindings, plasterTextureBindings } from "../runtime/ConstructionBindings";
import { stoneFloorTextureBindings } from "../runtime/ConstructionStoneFloorAssets";

type Unit = { family: string; instanceStride: number; directInstances?: boolean; textureSlots: Record<string, string> };
type Kit = {
  gothic: Readonly<Record<string, { frameTemplate: string; glassTemplate: string }>>;
  textures: Readonly<Record<string, unknown>>;
  neutralTextures: Readonly<Record<string, unknown>>;
  textureColors: Readonly<Record<string, readonly number[]>>;
};
/** ABI of the building producers, not a list of asset paths. A kit can replace
 * the Prefabs, but must still consume the records emitted by those producers.
 * Optional decoration templates are resolved through their authored references. */
const baseUnits: Readonly<Record<string, readonly [string, number, boolean]>> = {
  brick: ["brick", 64, false],
  roof: ["roof", 64, true],
  wood: ["wood", 80, false],
  brick_roof: ["brick", 64, false],
  wood_roof: ["wood", 80, false]
};

/** Shared by detached publication validation and live native resource extraction. */
export function validateBuildingAssetContract(kit: Kit, units: Readonly<Record<string, Unit>>): void {
  const requireUnit = (name: string, family: string, stride: number, direct: boolean) => {
    const unit = units[name];
    if (!unit) throw Error("Missing building unit Prefab: " + name);
    if (unit.family !== family || unit.instanceStride !== stride || (unit.directInstances ?? false) !== direct)
      throw Error(
        `Building unit '${name}' requires ${family}/${stride}/${direct ? "direct" : "indirect"} instance ABI`
      );
  };
  for (const [name, [family, stride, direct]] of Object.entries(baseUnits)) requireUnit(name, family, stride, direct);
  for (const unit of Object.values(kit.gothic)) {
    requireUnit(unit.frameTemplate, "frame", 64, false);
    requireUnit(unit.glassTemplate, "glass", 64, false);
  }
  // The same bindings drive the generated decoration/plaster/floor shaders.
  const textures = new Set([
    ...Object.values(units).flatMap((unit) => Object.values(unit.textureSlots ?? {})),
    ...[...decorationTextureBindings, ...plasterTextureBindings, ...stoneFloorTextureBindings].map(([, name]) => name)
  ]);
  for (const name of textures) if (!kit.textures?.[name]) throw Error("Missing building Texture: " + name);
  // Palette mode samples the neutral texture and takes the colour from the palette.
  // Its shader uniforms still need the original RGBA colors, even in white mode.
  // The built-in kit no longer ships the authored colour textures: for these names
  // `textures` and `neutralTextures` reference the same neutral texture.
  for (const name of ["roof_colors", "brick_colors", "timberframe", "plaster_colors", "mortar"]) {
    const colors = kit.textureColors?.[name];
    if (
      !kit.neutralTextures?.[name] ||
      !Array.isArray(colors) ||
      !colors.length ||
      colors.length % 4 ||
      !colors.every(Number.isFinite)
    )
      throw Error("Missing/invalid building palette: " + name);
  }
}
