import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import { expect, it } from "vitest";
import type { MeshRenderer, Texture2D } from "@galacean/engine";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import { encodeWaterTerrainAssets } from "@galacean/engine-water/water/native/WaterTerrainAssets";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import {
  editWaterSource,
  writeWaterTerrainAssets
} from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { createNativeWaterAgentPackage } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterAgent";
import { WaterAPI } from "@galacean/engine-water/water/native/WaterAPI";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { OceanTextureLibrary } from "@galacean/engine-water/water/runtime/ocean/OceanTextureLibrary";
import { lake, terrain } from "../../water/tests/WaterFixtures";
import { openWaterEditorFixture } from "./WaterEditorFixture";

it("edits a real Source lake through public history and reopens it in a new Engine", async () => {
  const builtin = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const input = {
    shape: lake,
    terrain: { mode: "asset", description: { $ref: "Water/bed.json" }, heights: { $ref: "Water/bed.bin" } },
    quality: createWaterQualitySettings("lake", { spatialField: { maximumDepthError: 0.02 } }),
    material: { $ref: "Water/Materials/lake.mat" }
  };
  const terrainAssets = encodeWaterTerrainAssets(terrain);
  const contents: Record<string, string | Uint8Array> = {
    "Main.scene": JSON.stringify({
      asset: { version: "2.0" },
      scene: { rootEntities: [], background: { mode: 0, color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } } },
      entities: [],
      components: []
    }),
    "Water/lake.prefab": JSON.stringify({
      asset: { version: "2.0" },
      root: "root",
      entities: [{ id: "root", name: "Lake", components: ["body"] }],
      components: [{ id: "body", type: "WaterBodyComponent", props: { authoring: input } }]
    }),
    "Water/bed.json": JSON.stringify(terrainAssets.description),
    "Water/bed.bin": terrainAssets.heights
  };
  const urls = Object.values(contents).map((content) => URL.createObjectURL(new Blob([content])));
  const manifest = {
    scene: "Main.scene",
    files: [
      ...builtin.files
        .filter((file: { type: string }) => !["Scene", "Prefab"].includes(file.type))
        .map((file: { virtualPath: string; path: string }) => ({
          ...file,
          path: new URL(file.path, BUILTIN_WATER_PROJECT_URL).href
        })),
      ...Object.keys(contents).map((virtualPath, index) => ({
        virtualPath,
        path: urls[index],
        type: virtualPath.endsWith(".scene")
          ? "Scene"
          : virtualPath.endsWith(".prefab")
            ? "Prefab"
            : virtualPath.endsWith(".bin")
              ? "Buffer"
              : "JSON"
      }))
    ]
  };
  const id = `water-test:${crypto.randomUUID()}`;
  const open = () => openWaterEditorFixture(id, manifest);
  let current: Awaited<ReturnType<typeof open>> | undefined;
  try {
    current = await open();
    const created = await current.water.change({ operation: "create", name: "Editable Lake", input });
    expect(created.runtimeError).toBeUndefined();
    expect(current.system.sample(4, 4)).toMatchObject({ water: true, surfaceElevationMetres: 0.5 });
    current.engine.update();
    expect(current.canvas.getContext("webgl2")!.getError()).toBe(0);
    const beforePrefab = current.system.revision;
    const linked = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        const scene = new RuntimeSceneEdit(draft, "Main.scene");
        scene.create({ name: "Linked Lake A", prefab: "Water/lake.prefab", position: [12, 0, 0] });
        scene.create({ name: "Linked Lake B", prefab: "Water/lake.prefab", position: [24, 0, 0] });
        edited();
      })
    );
    expect(linked.runtimeError).toBeUndefined();
    expect(current.system.revision).toBe(beforePrefab + 1);
    expect(new Set(current.system.bodies.map((body) => body.waterId)).size).toBe(3);
    expect(current.system.sample(16, 4)).toMatchObject({ water: true });
    const carve = await current.water.change({
      operation: "update",
      id: created.value,
      patch: { shape: { ...lake, basin: { depthM: 3, bankWidthM: 1, carve: true } } }
    });
    expect(carve.accepted).toBe(true);
    expect(carve.runtimeError).toContain("cannot carve a lake basin");
    expect(current.system.sample(4, 4)).toMatchObject({ water: true, surfaceElevationMetres: 0.5 });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    const update = await current.water.change({
      operation: "update",
      id: created.value,
      patch: { shape: { ...lake, levelOffsetM: 0.25 }, visible: false }
    });
    expect(update.runtimeError).toBeUndefined();
    expect(current.system.sample(4, 4)).toMatchObject({ water: true, surfaceElevationMetres: 0.75 });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(current.system.sample(4, 4)).toMatchObject({ surfaceElevationMetres: 0.5 });
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    const beforeInvalid = current.project.publicationRevision;
    await expect(
      current.water.change({ operation: "update", id: created.value, patch: { priority: Infinity } })
    ).rejects.toThrow("finite");
    for (const patch of [{ material: { $ref: "Water/missing.mat" } }, { material: { $ref: "Water/bed.json" } }])
      await expect(current.water.change({ operation: "update", id: created.value, patch })).rejects.toThrow();
    expect(current.project.publicationRevision).toBe(beforeInvalid);
    await expect(
      current.water.change({
        operation: "update",
        id: created.value,
        patch: { look: { $ref: "Water/obsolete.water" } } as never
      })
    ).rejects.toThrow("Unknown Water authoring property");
    expect(current.project.publicationRevision).toBe(beforeInvalid);
    expect((await current.water.color(created.value, [30, 130, 180], "instance")).runtimeError).toBeUndefined();
    const originalMaterial = current.system.bodies[0].configuration!.material;
    expect(
      (await current.water.change({ operation: "update", id: created.value, patch: { priority: 0, visible: false } }))
        .runtimeError
    ).toBeUndefined();
    expect(current.system.bodies[0].configuration!.material).toBe(originalMaterial);
    const prefabIdentity = current.editor.projection
      .queryComponents({ type: "WaterBodyComponent" })
      .find((identity) => identity.id !== created.value)!;
    const firstRevision = current.system.bodies[0].revision,
      beforeShared = current.system.revision;
    expect((await current.water.color(prefabIdentity.id, [60, 160, 120], "shared")).runtimeError).toBeUndefined();
    expect(current.system.revision).toBe(beforeShared + 1);
    expect(current.system.bodies[0].revision).toBe(firstRevision);
    const independent = current.system.bodies[0],
      shared = current.system.bodies.find((body) => body !== independent)!;
    const independentMaterial = independent.configuration!.material!,
      originalTexture = independentMaterial.shaderData.getTexture(
        "material_Water_appearance_appearance_detailLayers_0_texture"
      ) as Texture2D;
    expect(originalTexture).toMatchObject({
      width: 512,
      height: 512,
      isSRGBColorSpace: false,
      wrapModeU: 1,
      filterMode: 1
    });
    const bed = shared.configuration!.asset,
      revisionBeforeTexture = current.system.revision;
    const replace = await current.water.texture(
      prefabIdentity.id,
      "Water/Textures/farmlands-wave-large-normal.ktx2",
      "shared"
    );
    expect(replace.runtimeError).toBeUndefined();
    expect(current.system.revision).toBe(revisionBeforeTexture + 1);
    expect(shared.configuration!.asset).toBe(bed);
    expect(independent.revision).toBe(firstRevision);
    expect(originalTexture.destroyed).toBe(false);
    let boundTexture: Texture2D | undefined;
    current.system.activeRuntimeHost!.visitBodyRenderers((id, renderer) => {
      if (id === shared.waterId)
        boundTexture = renderer
          .getMaterial()
          ?.shaderData.getTexture("material_AppearanceV2Detail0Texture") as Texture2D;
    });
    expect(boundTexture).toBeDefined();
    expect(boundTexture).not.toBe(originalTexture);
    const replacement = new Uint8Array(await (await fetch(
      new URL("../../water/tests/assets/replacement-normal.ktx2", import.meta.url).href
    )).arrayBuffer());
    expect(
      (
        await current.water.execute((edit) =>
          edit.run(({ draft, edited }) => {
            draft.update("Water/Textures/farmlands-wave-large-normal.ktx2", replacement);
            edited();
          })
        )
      ).runtimeError
    ).toBeUndefined();
    current.system.activeRuntimeHost!.visitBodyRenderers((id, renderer) => {
      if (id === shared.waterId)
        boundTexture = renderer
          .getMaterial()
          ?.shaderData.getTexture("material_AppearanceV2Detail0Texture") as Texture2D;
    });
    expect(boundTexture).toMatchObject({ width: 32, height: 32, isSRGBColorSpace: false });
    const beforeDelete = current.project.publicationRevision;
    await expect(
      current.water.execute((edit) =>
        edit.run(({ draft, edited }) => {
          draft.delete("Water/Textures/farmlands-wave-large-normal.ktx2");
          edited();
        })
      )
    ).rejects.toThrow();
    expect(current.project.publicationRevision).toBe(beforeDelete);
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    const beforeAgent = current.system.revision;
    const agent = await current.water.execute((edit) =>
      createNativeWaterAgentPackage(edit, "Main.scene").tools[0].execute(
        {
          operation: "updateMany",
          updates: [
            { id: created.value, patch: { priority: 1, quality: { spatialField: { maximumDepthError: 0 } } } },
            { id: prefabIdentity.id, patch: { priority: 2 } }
          ]
        },
        { signal: new AbortController().signal }
      )
    );
    expect(agent.runtimeError).toBeUndefined();
    expect(agent.value).toMatchObject({ status: "prepared-in-draft" });
    expect(current.system.revision).toBe(beforeAgent + 1);
    expect(
      (current.editor.projection.component(created.value) as WaterBodyComponent).authoring!.quality.spatialField
        .maximumDepthError
    ).toBe(0);
    const beforeInvalidMany = current.project.publicationRevision;
    await expect(
      current.water.change({
        operation: "updateMany",
        updates: [
          { id: created.value, patch: { priority: 5 } },
          { id: prefabIdentity.id, patch: { priority: Infinity } }
        ]
      })
    ).rejects.toThrow("finite");
    expect(current.project.publicationRevision).toBe(beforeInvalidMany);
    expect(current.system.bodies[0].configuration?.priority).toBe(1);
    const group = await current.water.execute(async (edit) => {
      await writeWaterTerrainAssets(edit, "Water/connection-bed.json", {
        id: "connection-bed",
        revision: 1,
        origin: [-20, -20],
        spacing: 1,
        columns: 65,
        rows: 65,
        heights: Array(65 * 65).fill(-1)
      });
      const left = (await editWaterSource(edit, "Main.scene", {
        operation: "create",
        name: "Connected Lake A",
        input: {
          ...input,
          terrain: {
            mode: "asset",
            description: { $ref: "Water/connection-bed.json" },
            heights: { $ref: "Water/connection-bed.bin" }
          }
        }
      })) as string;
      const right = (await editWaterSource(edit, "Main.scene", {
        operation: "create",
        name: "Connected Lake B",
        input: {
          ...input,
          terrain: {
            mode: "asset",
            description: { $ref: "Water/connection-bed.json" },
            heights: { $ref: "Water/connection-bed.bin" }
          },
          shape: { ...lake, shoreline: lake.shoreline.map((point) => ({ ...point, x: point.x + 3 })) }
        }
      })) as string;
      await editWaterSource(edit, "Main.scene", {
        operation: "update",
        id: left,
        patch: {
          connections: [
            {
              id: "lake-join",
              target: { $component: right },
              section: [
                [6, 5],
                [6, 3]
              ],
              transitionLengths: [1, 1]
            }
          ]
        }
      });
      return { left, right };
    });
    expect(group.runtimeError).toBeUndefined();
    const connected = current.editor.projection.component(group.value.left) as WaterBodyComponent;
    expect(current.system.sample(6.25, 4, connected.waterId)).toMatchObject({ water: false });
    expect((await current.water.change({ operation: "remove", id: group.value.right })).runtimeError).toBeUndefined();
    expect(current.system.sample(6.25, 4, connected.waterId)).toMatchObject({ water: true });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(current.system.sample(6.25, 4, connected.waterId)).toMatchObject({ water: false });
    const moved = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        const scene = new RuntimeSceneEdit(draft, "Main.scene"),
          identity = scene.queryComponents({ id: group.value.left })[0];
        scene.update(identity.entityId, { position: [1, 0, 0] });
        edited();
      })
    );
    expect(moved.runtimeError).toContain("identity world placement");
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    const connectionPrefabs = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        const authoring = {
          ...input,
          terrain: {
            mode: "asset",
            description: { $ref: "Water/connection-bed.json" },
            heights: { $ref: "Water/connection-bed.bin" }
          }
        };
        draft.create(
          { virtualPath: "Water/connected.prefab", path: "Water/connected.prefab", type: "Prefab" },
          JSON.stringify({
            asset: { version: "2.0" },
            root: "group",
            entities: [
              { id: "group", name: "Group", children: ["left", "right"] },
              { id: "left", name: "Left", components: ["left-body"] },
              { id: "right", name: "Right", components: ["right-body"] }
            ],
            components: [
              {
                id: "left-body",
                type: "WaterBodyComponent",
                props: {
                  authoring: {
                    ...authoring,
                    connections: [
                      {
                        id: "join",
                        target: { $component: "right-body" },
                        section: [
                          [6, 5],
                          [6, 3]
                        ],
                        transitionLengths: [1, 1]
                      }
                    ]
                  }
                }
              },
              {
                id: "right-body",
                type: "WaterBodyComponent",
                props: {
                  authoring: {
                    ...authoring,
                    shape: { ...lake, shoreline: lake.shoreline.map((point) => ({ ...point, x: point.x + 3 })) }
                  }
                }
              }
            ]
          })
        );
        const scene = new RuntimeSceneEdit(draft, "Main.scene");
        const roots = [
          scene.create({ name: "Group A", prefab: "Water/connected.prefab" }).id,
          scene.create({ name: "Group B", prefab: "Water/connected.prefab" }).id
        ];
        edited();
        return roots;
      })
    );
    expect(connectionPrefabs.runtimeError).toBeUndefined();
    const members = current.editor.projection
      .queryComponents({ type: "WaterBodyComponent" })
      .filter((identity) => identity.id.includes(connectionPrefabs.value[0]));
    const memberLeft = members.find((identity) => identity.id.includes("left-body"))!,
      memberRight = members.find((identity) => identity.id.includes("right-body"))!;
    const linkedLeft = current.editor.projection.component(memberLeft.id) as WaterBodyComponent;
    expect(linkedLeft.authoring!.connections![0].target).toBe(current.editor.projection.component(memberRight.id));
    expect((await current.water.change({ operation: "remove", id: memberRight.id })).runtimeError).toBeUndefined();
    expect(current.system.sample(6.25, 4, linkedLeft.waterId)).toMatchObject({ water: true });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(current.system.sample(6.25, 4, linkedLeft.waterId)).toMatchObject({ water: false });
    expect(
      (
        await current.water.execute((edit) =>
          edit.run(({ draft, edited }) => {
            const scene = new RuntimeSceneEdit(draft, "Main.scene");
            for (const root of connectionPrefabs.value) scene.delete(root);
            edited();
          })
        )
      ).runtimeError
    ).toBeUndefined();
    const riverShape: WaterShapeAuthoring = {
      kind: "river",
      speed: 0,
      course: {
        id: "editable-course",
        points: [
          { id: "head", x: 2, z: 4, elevation: 0, width: 1, depth: 1 },
          { id: "tail", x: 6, z: 4, elevation: 0, width: 1, depth: 1 }
        ]
      }
    };
    const river = await current.water.change({
      operation: "create",
      name: "River",
      input: {
        shape: riverShape,
        terrain: input.terrain,
        material: { $ref: "Water/Materials/river.mat" }
      }
    });
    expect(river.runtimeError).toBeUndefined();
    const riverBody = current.editor.projection.component(river.value) as WaterBodyComponent;
    expect(current.system.sample(4, 4, riverBody.waterId)).toMatchObject({
      water: true,
      surfaceElevationMetres: 0,
      depth: { value: 1, quality: "actual" }
    });
    expect(
      (
        await current.water.change({
          operation: "update",
          id: river.value,
          patch: {
            shape: {
              ...riverShape,
              course: {
                ...riverShape.course,
                points: riverShape.course.points.map((point) => ({ ...point, width: 2 }))
              }
            }
          }
        })
      ).runtimeError
    ).toBeUndefined();
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    const invalidDepth = await current.water.change({
      operation: "update",
      id: river.value,
      patch: {
        shape: {
          ...riverShape,
          course: {
            ...riverShape.course,
            points: riverShape.course.points.map((point) => ({ ...point, width: 2, depth: 2 }))
          }
        }
      }
    });
    expect(invalidDepth.accepted).toBe(true);
    expect(invalidDepth.runtimeError).toContain("TERRAIN_CHANGE_REQUIRED");
    expect(riverBody.lastError).toContain("TERRAIN_CHANGE_REQUIRED");
    expect(current.system.sample(4, 4, riverBody.waterId)).toMatchObject({ depth: { value: 1 } });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(riverBody.lastError).toBeUndefined();
    const oceanShape: WaterShapeAuthoring = {
      kind: "ocean",
      waterLevel: 0.25,
      layout: {
        schemaVersion: 1,
        kind: "ocean-surface-layout",
        centerXZ: [4, 4],
        size: 8,
        surfaceTopology: "finite",
        finitePatchGridSize: 4
      }
    };
    const ocean = await current.water.change({
      operation: "create",
      name: "Ocean",
      input: {
        shape: oceanShape,
        terrain: input.terrain,
        quality: createWaterQualitySettings("ocean"),
        material: { $ref: "Water/Materials/ocean.mat" }
      }
    });
    expect(ocean.accepted).toBe(true);
    expect(ocean.runtimeError).toContain("complete nearshore authority grid");
    const oceanBody = current.editor.projection.component(ocean.value) as WaterBodyComponent;
    expect(oceanBody.authoring!.shape).toMatchObject({ layout: { size: 8 } });
    expect(oceanBody.lastError).toContain("complete nearshore authority grid");
    await current.water.flush();
    expect(
      (
        await current.water.change({
          operation: "update",
          id: ocean.value,
          patch: {
            shape: { ...oceanShape, layout: { ...oceanShape.layout, size: 10 } }
          }
        })
      ).runtimeError
    ).toBeUndefined();
    expect(oceanBody.lastError).toBeUndefined();
    expect(current.system.sample(4, 4, oceanBody.waterId)).toMatchObject({
      water: true,
      surfaceElevationMetres: 0.25,
      surfaceModel: "ocean-datum-excludes-gerstner"
    });
    expect(oceanBody.authoring!.material!.shaderData.getTexture("material_Ocean_smoothWaves")).toMatchObject({
      filterMode: 2,
      anisoLevel: 4,
      isSRGBColorSpace: false
    });
    const oceanTexturesA = await OceanTextureLibrary.create(current.engine),
      oceanTexturesB = await OceanTextureLibrary.create(current.engine);
    expect(oceanTexturesA.textures.smoothWaves).toBe(oceanTexturesB.textures.smoothWaves);
    oceanTexturesA.destroy();
    expect(oceanTexturesB.textures.smoothWaves.destroyed).toBe(false);
    oceanTexturesB.destroy();
    expect(
      (oceanBody.authoring!.material!.shaderData.getTexture("material_Ocean_smoothWaves") as Texture2D).destroyed
    ).toBe(false);
    expect(
      (
        await current.water.change({
          operation: "update",
          id: ocean.value,
          patch: { shape: { ...oceanShape, layout: { ...oceanShape.layout, size: 12 } } }
        })
      ).runtimeError
    ).toBeUndefined();
    current.engine.update();
    expect(current.canvas.getContext("webgl2")!.getError()).toBe(0);
    const runtimeWrite = await new WaterAPI(current.system).execute({
      operation: "setEnabled",
      input: {
        id: current.system.bodies[0].waterId,
        enabled: false
      }
    });
    expect(runtimeWrite).toMatchObject({ ok: false, error: { code: "NOT_SUPPORTED" } });
    expect(current.system.bodies[0].enabled).toBe(true);
    await current.system.setRuntimeEnabled(false);
    expect(current.system.sample(4, 4, independent.waterId)).toMatchObject({ water: false });
    expect(current.system.bodies[0].destroyed).toBe(false);
    await current.system.setRuntimeEnabled(true);
    expect(current.system.sample(4, 4, independent.waterId)).toMatchObject({
      water: true,
      surfaceElevationMetres: 0.75
    });
    const waterId = current.system.bodies[0].waterId;
    await current.close();
    current = await open();
    expect(current.project.history.query().undo).toHaveLength(0);
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    expect(current.system.bodies[0].waterId).toBe(waterId);
    expect(
      (current.editor.projection.component(created.value) as WaterBodyComponent).authoring!.quality.spatialField
        .maximumDepthError
    ).toBe(0);
    expect(current.system.sample(4, 4, waterId)).toMatchObject({ water: true, surfaceElevationMetres: 0.75 });
    expect(current.system.bodies).toHaveLength(7);
    const reopenedConnection = current.editor.projection.component(group.value.left) as WaterBodyComponent;
    expect(reopenedConnection.authoring!.connections![0].target).toBe(
      current.editor.projection.component(group.value.right)
    );
    expect(current.system.sample(6.25, 4, reopenedConnection.waterId)).toMatchObject({ water: false });
    const reopenedRiver = current.editor.projection.component(river.value) as WaterBodyComponent;
    expect(reopenedRiver.authoring!.shape).toMatchObject({
      kind: "river",
      speed: 0,
      course: { points: [{ width: 2 }, { width: 2 }] }
    });
    expect(current.system.sample(4, 4, reopenedRiver.waterId)).toMatchObject({
      water: true,
      surfaceElevationMetres: 0
    });
    expect((current.editor.projection.component(ocean.value) as WaterBodyComponent).authoring!.shape).toMatchObject({
      kind: "ocean",
      layout: { size: 12 }
    });
    const reopenedShared = current.system.bodies.find((body) => body.waterId === shared.waterId)!;
    expect(
      reopenedShared.configuration!.material!.shaderData.getTexture(
        "material_Water_appearance_appearance_detailLayers_0_texture"
      )
    ).toMatchObject({ width: 32, height: 32 });
    let renderer: MeshRenderer | undefined;
    current.system.activeRuntimeHost!.visitBodyRenderers((id, currentRenderer) => {
      const identity = current!.host.identityForRenderer(currentRenderer);
      if (identity?.id === prefabIdentity.id) renderer = currentRenderer;
    });
    expect(renderer).toBeDefined();
    expect(current.host.identityForRenderer(renderer!)?.id).toBe(prefabIdentity.id);
    expect((await current.water.change({ operation: "remove", id: prefabIdentity.id })).runtimeError).toBeUndefined();
    expect(current.system.bodies).toHaveLength(6);
    expect(current.host.identityForRenderer(renderer!)).toBeUndefined();
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(current.system.bodies).toHaveLength(7);
  } finally {
    await current?.close();
    for (const url of urls) URL.revokeObjectURL(url);
  }
});
