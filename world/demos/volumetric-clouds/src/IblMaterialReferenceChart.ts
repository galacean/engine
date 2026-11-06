import { type Engine, type Entity, MeshRenderer, PBRMaterial, PrimitiveMesh } from "@galacean/engine";

/** Samples the full realtime-GGX roughness range without using the singular zero-roughness endpoint. */
export const IBL_REFERENCE_ROUGHNESS_LEVELS = Object.freeze([0.04, 0.2, 0.4, 0.65, 0.9] as const);

const COLUMN_SPACING = 1.02;
const ROW_SPACING = 1.02;
const SPHERE_RADIUS = 0.42;
const SPHERE_SEGMENTS = 32;
const CHART_DISTANCE = 5.2;
const NEUTRAL_REFERENCE_BASE_COLOR = Object.freeze([0.62, 0.62, 0.62, 1] as const);

interface IblReferenceMaterialRow {
  readonly name: string;
  readonly metallic: number;
  readonly baseColor: readonly [number, number, number, number];
}

const MATERIAL_ROWS: readonly IblReferenceMaterialRow[] = Object.freeze([
  Object.freeze({
    name: "Dielectric",
    metallic: 0,
    baseColor: NEUTRAL_REFERENCE_BASE_COLOR
  }),
  Object.freeze({
    name: "Metal",
    metallic: 1,
    baseColor: NEUTRAL_REFERENCE_BASE_COLOR
  })
]);

/**
 * Creates a camera-relative material chart for inspecting the shared realtime SH + GGX IBL.
 * Camera-relative placement keeps the chart visible while the user turns to inspect different sky directions.
 */
export function createIblMaterialReferenceChart(engine: Engine, cameraEntity: Entity): Entity {
  const root = cameraEntity.createChild("Realtime IBL Material Reference Chart");
  root.transform.setPosition(0, -0.22, -CHART_DISTANCE);
  const sphereMesh = PrimitiveMesh.createSphere(engine, SPHERE_RADIUS, SPHERE_SEGMENTS);
  const halfColumnCount = (IBL_REFERENCE_ROUGHNESS_LEVELS.length - 1) * 0.5;
  const halfRowCount = (MATERIAL_ROWS.length - 1) * 0.5;

  for (let rowIndex = 0; rowIndex < MATERIAL_ROWS.length; rowIndex++) {
    const row = MATERIAL_ROWS[rowIndex];
    for (let columnIndex = 0; columnIndex < IBL_REFERENCE_ROUGHNESS_LEVELS.length; columnIndex++) {
      const roughness = IBL_REFERENCE_ROUGHNESS_LEVELS[columnIndex];
      const sphere = root.createChild(`${row.name} · Roughness ${roughness.toFixed(2)}`);
      sphere.transform.setPosition(
        (columnIndex - halfColumnCount) * COLUMN_SPACING,
        (halfRowCount - rowIndex) * ROW_SPACING,
        0
      );

      const material = new PBRMaterial(engine);
      material.name = `${row.name} IBL Reference · R${roughness.toFixed(2)} M${row.metallic}`;
      material.baseColor.set(...row.baseColor);
      material.metallic = row.metallic;
      material.roughness = roughness;

      const renderer = sphere.addComponent(MeshRenderer);
      renderer.mesh = sphereMesh;
      renderer.setMaterial(material);
      renderer.castShadows = false;
      renderer.receiveShadows = false;
    }
  }

  return root;
}
