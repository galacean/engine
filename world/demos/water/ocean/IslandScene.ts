import {
  Color,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  Vector2,
  Vector3,
  type Engine,
  type Entity
} from "@galacean/engine";
import type { OceanWaterBodyDescriptorV1 } from "@galacean/engine-water/water/runtime/ocean/index";
import { sampleIslandHeight } from "./IslandOceanSource.ts";

/** The visible ground uses the exact Ocean source samples, including the submerged shelf. */
export function createIslandScene(engine: Engine, root: Entity, descriptor: Readonly<OceanWaterBodyDescriptorV1>) {
  const { grid, bedHeights } = descriptor.config.nearshoreDescriptor;
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const colors: Color[] = [];
  const uvs: Vector2[] = [];
  const indices = new Uint32Array((grid.width - 1) * (grid.height - 1) * 6);
  let offset = 0;
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const x = grid.originXZ[0] + column * grid.cellSizeXZ[0];
      const z = grid.originXZ[1] + row * grid.cellSizeXZ[1];
      const y = bedHeights[row * grid.width + column]!;
      positions.push(new Vector3(x, y, z));
      const normal = new Vector3(
        sampleIslandHeight(x - 0.5, z) - sampleIslandHeight(x + 0.5, z),
        1,
        sampleIslandHeight(x, z - 0.5) - sampleIslandHeight(x, z + 0.5)
      ).normalize();
      normals.push(normal);
      uvs.push(new Vector2(x / 8, z / 8));
      const grass = Math.max(0, Math.min(1, (y - 2.3) / 3));
      const rock = Math.max(0, Math.min(1, (0.86 - normal.y) * 5 + (y - 27) * 0.13));
      const variation = 0.95 + 0.05 * Math.sin(x * 1.7) * Math.cos(z * 1.3);
      const sandColor = [0.63, 0.51, 0.32];
      const grassColor = [0.15, 0.25, 0.055];
      const rockColor = [0.29, 0.28, 0.23];
      const channels = sandColor.map(
        (sand, channel) =>
          ((sand + (grassColor[channel]! - sand) * grass) * (1 - rock) + rockColor[channel]! * rock) * variation
      );
      colors.push(new Color(channels[0], channels[1], channels[2], 1));
      if (row < grid.height - 1 && column < grid.width - 1) {
        const a = row * grid.width + column;
        indices.set([a, a + grid.width, a + 1, a + 1, a + grid.width, a + grid.width + 1], offset);
        offset += 6;
      }
    }
  }
  const mesh = new ModelMesh(engine);
  mesh.name = "Island and authoritative seabed";
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.setUVs(uvs);
  mesh.setIndices(indices);
  mesh.addSubMesh(0, indices.length);
  mesh.bounds.min.set(grid.originXZ[0], -28, grid.originXZ[1]);
  mesh.bounds.max.set(-grid.originXZ[0], 60, -grid.originXZ[1]);
  mesh.uploadData(true);
  const material = new PBRMaterial(engine);
  material.name = "Island sand, grass and stone";
  material.roughness = 0.95;
  material.metallic = 0;
  const entity = root.createChild("Central island");
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.enableVertexColor = true;
  renderer.castShadows = true;
  renderer.receiveShadows = true;
  renderer.setMaterial(material);
  return {
    destroy() {
      entity.destroy();
      mesh.destroy();
      material.destroy();
    }
  };
}
