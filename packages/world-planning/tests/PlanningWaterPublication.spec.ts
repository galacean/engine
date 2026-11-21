import { describe, expect, it } from "vitest";
import { createSeedPlanningDocument } from "../src/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "../src/spatial/PlanningDocument";
import { PlanningSession } from "../src/spatial/PlanningSession";
import { planningHeightmap } from "../src/semantic-study/PlanningHeightmap";
import { planningAlphamap } from "../src/semantic-study/PlanningAlphamap";
import {
  compilePlanningSeedWorldData,
  planningSeedWorldDataSnapshot,
  preparePlanningSeedWorldData,
  stripPlanningTerrainNormalSamples
} from "../src/spatial/runtime/PlanningSeedWorldData";
import {
  planningSurfacePublicationGate,
  preparePlanningWaterImpact
} from "../src/spatial/runtime/PlanningWaterPublication";
import { PLANT_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";

describe("PlanningWaterPublication & PlanningSeedWorldData root-cause invariants", () => {
  it("handles omitted optional hydrology fields in preparePlanningWaterImpact and never retains terrainNormalSamples in snapshots", async () => {
    const doc = createSeedPlanningDocument(1);
    const session = new PlanningSession(exportPlanningRecipe(doc), undefined, doc);
    await session.initialize();
    const prevDoc = session.export();
    const prevPlan = session.result!.plan;

    const prevCompiled = compilePlanningSeedWorldData(prevPlan, {
      height: planningHeightmap(prevPlan),
      alpha: planningAlphamap(prevPlan)
    });
    expect(prevCompiled.fields.flow).toBeUndefined();
    expect(prevCompiled.fields.sediment).toBeUndefined();
    expect(prevCompiled.fields.wetness).toBeUndefined();
    expect(prevCompiled.fields.wetlandWeight).toBeUndefined();
    expect(prevCompiled.fields.wetlandWaterLevelMetres).toBeUndefined();
    expect(prevCompiled.terrainNormalSamples.byteLength).toBeGreaterThan(0);

    // preparePlanningSeedWorldData strips transient terrainNormalSamples before caching into snapshots.
    preparePlanningSeedWorldData(
      prevPlan,
      { height: planningHeightmap(prevPlan), alpha: planningAlphamap(prevPlan) },
      prevCompiled
    );
    const cachedPrev = planningSeedWorldDataSnapshot(prevPlan, () => {
      throw Error("Expected snapshots WeakMap cache hit");
    });
    expect("terrainNormalSamples" in cachedPrev).toBe(false);

    // Apply a live terrain-patch edit that passes planningSurfacePublicationGate(dependentSolids = true).
    const editedDoc = session.export();
    editedDoc.authoredResources = [
      ...(editedDoc.authoredResources ?? []),
      {
        resourceId: "regression-terrain-patch",
        resourceType: "terrain-patch",
        properties: { x: prevPlan.spawn.x + 20, z: prevPlan.spawn.z, radiusMetres: 10, heightDeltaMetres: 3 }
      }
    ];
    const receipt = await session.load(editedDoc);
    expect(receipt.status).toBe("accepted");
    const nextResult = session.result!;
    const nextPlan = nextResult.plan;

    let receivedNormalsLength = 0;
    const noopUpdate = { commit() {}, rollback() {}, finalize() {}, discard() {} };
    const fakePreviousScene = {
      plan: prevPlan,
      data: stripPlanningTerrainNormalSamples(prevCompiled),
      revision: prevDoc.revision,
      solids: { formations: [], bridges: [], prepareWaterPlan: () => noopUpdate },
      vegetation: {
        plantAssets: PLANT_SPECIES.map((species) => ({
          id: species.id,
          height: 10,
          radius: 0.5,
          footprintArea: 1
        })),
        prepareWaterImpact: async () => noopUpdate
      },
      world: {
        getSurfaceReliefTuning: () => undefined,
        settleLocalHeightTransition: () => {},
        prepareWaterTerrain: (_fields: unknown, _intent: unknown, _settings: unknown, normals: Uint8Array) => {
          receivedNormalsLength = normals.byteLength;
          return noopUpdate;
        },
        waterGrassCoverage: () => undefined,
        population: {
          prepareWaterImpact: async () => noopUpdate,
          prepareRockGrass: () => noopUpdate
        },
        applyAuthoringHeightPatch: () => {}
      },
      masonry: { terrainEditPending: false, prepareTerrain: async () => noopUpdate }
    } as any;

    const gateReason = planningSurfacePublicationGate(
      fakePreviousScene,
      prevDoc,
      session.export(),
      nextResult,
      false,
      undefined,
      true
    );
    expect(gateReason).toBeUndefined();

    const nextCompiled = compilePlanningSeedWorldData(nextPlan, {
      height: planningHeightmap(nextPlan),
      alpha: planningAlphamap(nextPlan)
    });
    const fakeRaster = {
      run: async () => {},
      takeNativeData: () => nextCompiled,
      takeSurfaceRelief: () => undefined
    } as any;

    // 1. Both omitted optional hydrology fields pass cleanly through preparePlanningWaterImpact (!dependencies branch).
    const frameNoDeps = await preparePlanningWaterImpact(
      fakePreviousScene,
      nextResult,
      fakeRaster,
      new AbortController().signal,
      1,
      session.export().revision
    );
    expect(receivedNormalsLength).toBe(nextCompiled.terrainNormalSamples.byteLength);
    expect(frameNoDeps.data.terrainNormalSamples).toBeUndefined();
    const cachedNext = planningSeedWorldDataSnapshot(nextPlan, () => {
      throw Error("Expected snapshots WeakMap cache hit");
    });
    expect("terrainNormalSamples" in cachedNext).toBe(false);

    // 2. Asymmetric presence (one side omitted, one side populated) still fails closed with lattice mismatch.
    const asymmetricPrev = {
      ...fakePreviousScene,
      data: {
        ...fakePreviousScene.data,
        fields: {
          ...fakePreviousScene.data.fields,
          wetness: new Uint8Array(prevCompiled.fields.surfaceResolution ** 2)
        }
      }
    };
    await expect(
      preparePlanningWaterImpact(
        asymmetricPrev,
        nextResult,
        fakeRaster,
        new AbortController().signal,
        1,
        session.export().revision
      )
    ).rejects.toThrow("Terrain patch lattice mismatch");
  }, 120000);
});
