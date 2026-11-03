import { constructionDecorationDefinition } from "../runtime/ConstructionDecorationCatalog";
import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import type { MasonryDocument } from "../runtime/MasonryDocument";
import type { constructionPreview } from "../runtime/ConstructionPreview";
import { resolveDecorationConfig, generatedDecorationSeed } from "../runtime/ConstructionDecorationConfig";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import { buildingWallPosition, type BuildingShape } from "./BuildingShape";

export interface GeneratedBuildingGroup {
  /** An existing procedural generation result, never retained as author data. */
  document: MasonryDocument;
  /** Actual accepted geometry; rejected speculative attachments are not objects. */
  geometry: ReturnType<typeof constructionPreview>;
}
export interface BuildingSceneFragment {
  rootEntities: string[];
  entities: GalaceanSourceEntitySchema[];
  components: GalaceanSourceComponentSchema[];
}

/** Materialize one initial procedural result into native Source objects. This
 * does not migrate old saves or keep a generator directory. Only first-time
 * initialization invokes the recipe; editing generated children never reruns it.
 * Body IDs and order survive initialization; attachment IDs become Scene-wide,
 * while their accepted random seeds remain independent of the new identity. */
export function generateBuildingScene(
  groups: readonly GeneratedBuildingGroup[],
  assets: string
): BuildingSceneFragment {
  if (!assets.trim()) throw Error("Initial buildings require a VFS construction library reference");
  const result: BuildingSceneFragment = { rootEntities: [], entities: [], components: [] };
  const ids = new Set<string>();
  const claim = (id: string) => {
    if (!id || ids.has(id)) throw Error("Duplicate generated Scene identity: " + id);
    ids.add(id);
    return id;
  };
  const component = (entity: GalaceanSourceEntitySchema, id: string, type: string, props: object) => {
    (entity.components ??= []).push(claim(id));
    result.components.push({ id, type, props: structuredClone(props) as GalaceanSourceValueRecord });
  };
  const child = (
    parent: GalaceanSourceEntitySchema,
    id: string,
    name: string,
    position?: number[]
  ): GalaceanSourceEntitySchema => {
    const entity: GalaceanSourceEntitySchema = {
      id: claim(id),
      name,
      ...(position ? { position: position as [number, number, number] } : {})
    };
    (parent.children ??= []).push(id);
    result.entities.push(entity);
    return entity;
  };
  for (const { document, geometry } of groups) {
    const bodies = document.construction.buildings;
    if (!bodies.length) continue;
    if (document.construction.environment.type !== "host_terrain" || document.overrides.length)
      throw Error("Initial building generation requires terrain-based unedited geometry");
    const frameId = claim("building-group:" + JSON.stringify(bodies.map((body) => body.id)));
    const frame: GalaceanSourceEntitySchema = {
      id: frameId,
      name: "建筑组",
      position: document.placement
        ? [document.placement.position[0], document.placement.position[1], document.placement.position[2]]
        : [0, 0, 0],
      rotation: [0, ((document.placement?.rotationY ?? 0) * 180) / Math.PI, 0],
      children: []
    };
    result.rootEntities.push(frameId);
    result.entities.push(frame);
    const accepted = new Set([
      ...geometry.decorationParts.map((part) => JSON.stringify([part.ownerId, part.decorationId])),
      ...geometry.stones.map((part) => JSON.stringify([part.ownerId, part.decorationId])),
      ...geometry.frames.map((part) => JSON.stringify([part.ownerId, part.decorationId])),
      ...geometry.archGroups.map((group) => JSON.stringify([group.ownerId, group.decorationId])),
      ...geometry.retainedWallUnits
        .filter((part) => part.pickId)
        .map((part) => JSON.stringify([part.ownerId, part.pickId])),
      ...geometry.woodArchFrames.map((part) => JSON.stringify([part.ownerId, part.decorationId])),
      ...geometry.woodArchPillars.map((part) => JSON.stringify([part.ownerId, part.decorationId]))
    ]);
    for (const body of bodies) {
      const kind = body.kind ?? "house",
        originalShape = body.rectangle ?? body.circle!;
      // An omitted recovered seed resolves to the original owner slot, not zero.
      const seed = body.seed ?? document.construction.identity_order.indexOf(body.id) + 1;
      const shape: BuildingShape = body.rectangle
        ? { type: "rectangle", width: body.rectangle.size[0], depth: body.rectangle.size[1] }
        : { type: "circle", radius: body.circle!.radius };
      const entity = child(frame, body.id + ":entity", kind === "house" ? "房屋" : kind === "wall" ? "围墙" : "栅栏", [
        originalShape.center[0],
        0,
        originalShape.center[1]
      ]);
      // Construction's XZ orientation is clockwise; Entity yaw uses Engine's convention.
      entity.rotation = [0, (-(body.rectangle?.rotation ?? body.circle!.phase) * 180) / Math.PI, 0];
      component(
        entity,
        body.id,
        kind === "house" ? "HouseComponent" : kind === "wall" ? "WallComponent" : "FenceComponent",
        {
          assets: { $ref: assets },
          shape:
            shape.type === "rectangle"
              ? { $type: "RectangularBuildingShape", width: shape.width, depth: shape.depth }
              : { $type: "CircularBuildingShape", radius: shape.radius },
          height: body.height,
          seed,
          wallMaterial: body.material,
          wallColor: body.wall_color ?? 0,
          woodColor: body.wood_color ?? 0,
          ...(kind === "house"
            ? {
                roof: body.roof,
                foundation: body.foundation ?? null,
                plaster: body.plaster ?? null,
                floors: body.floors ?? null
              }
            : {})
        }
      );
      for (const binding of document.bindings.filter((binding) =>
        ["roof", "wall", "foundation", "surface"].some((role) => binding.geometry_id === body.id + "-" + role)
      )) {
        const role = binding.geometry_id.slice(body.id.length + 1);
        if (!["roof", "wall", "foundation", "surface"].includes(role))
          throw Error("Unsupported generated building surface: " + role);
        const { id, geometry_id, ...placement } = binding;
        component(entity, id, "BuildingSurfaceComponent", { role, placement });
      }
      // Optional detailed placement is distinct from the body's base wall.
      // Preserve an explicitly unbound source surface rather than adding units.
      for (const role of kind === "house" ? ["wall", ...(body.foundation ? ["foundation"] : [])] : []) {
        if (!document.bindings.some((binding) => binding.geometry_id === body.id + "-" + role))
          component(entity, body.id + ":unbound:" + role, "BuildingSurfaceComponent", {
            role,
            placementEnabled: false
          });
      }
      for (const candidate of body.decorations ?? []) {
        const decoration = resolveDecorationConfig(candidate, isFlatRoofHeight(body.roof.height));
        if (
          !decoration.enabled ||
          body.decorations_enabled === false ||
          !accepted.has(JSON.stringify([body.id, candidate.id]))
        )
          continue;
        const definition = decoration.type && constructionDecorationDefinition(decoration.type);
        if (!definition) throw Error("Unknown generated attachment: " + candidate.id);
        const purpose = definition.purpose;
        const roof = decoration.host === "roof";
        const type = roof
          ? purpose === "window"
            ? "RoofWindowComponent"
            : purpose === "hatch"
              ? "RoofHatchComponent"
              : purpose === "light"
                ? "RoofLampComponent"
                : undefined
          : purpose === "window"
            ? "WindowComponent"
            : purpose === "opening"
              ? "OpeningComponent"
              : purpose === "door"
                ? "DoorComponent"
                : purpose === "light"
                  ? "WallLampComponent"
                  : undefined;
        if (!type) throw Error("Unsupported generated attachment: " + candidate.id);
        const name =
          purpose === "window"
            ? roof
              ? "屋顶窗"
              : "窗户"
            : purpose === "opening"
              ? "拱形洞口"
              : purpose === "door"
                ? "门"
                : purpose === "hatch"
                  ? "屋顶活板门"
                  : roof
                    ? "屋顶灯"
                    : "墙灯";
        const id = body.id + ":decoration:" + candidate.id;
        const mount = child(
          entity,
          id + ":entity",
          name,
          roof ? undefined : buildingWallPosition(shape, decoration.u!, decoration.bottom)
        );
        component(mount, id, type, {
          type: decoration.type,
          rank: decoration.rank,
          width: decoration.width,
          height: decoration.height,
          ...(roof
            ? { uv: decoration.uv, elevation: decoration.bottom }
            : { seed: decoration.seed ?? generatedDecorationSeed(seed, candidate.id) }),
          ...Object.fromEntries(
            (["woodColor", "frameMaterial", "lightIntensity", "lightColor"] as const).flatMap((key) =>
              decoration[key] === undefined ? [] : [[key, decoration[key]]]
            )
          )
        });
      }
    }
  }
  return result;
}
