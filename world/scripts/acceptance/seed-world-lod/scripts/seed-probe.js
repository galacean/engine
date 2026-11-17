/* Injected into the dev-served SeedWorldDemo.ts by capture.cjs. It is never loaded by the product. */
window.lodSpawnReview = (() => {
  const { plan, world, solids, vegetation } = publication.current;
  const transform = camera.entity.transform;
  const position = transform.worldPosition.clone();
  const rotation = transform.worldRotationQuaternion.clone();
  const direction = transform.worldForward.clone();
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const roots = new Map();
  const groups = [];
  const meshes = new Map();
  const shared = world.root.findByName("Rock formations")?._components.find((c) => c.entries instanceof Map && c.eye);
  const desert = mojaveLayout?._components.find((c) => Array.isArray(c.instances) && c.rockMaterials);
  const corner = new Vector3();
  const projected = new Vector3();

  function addGroup(runtime, id, family, clock) {
    groups.push({ runtime, clock });
    for (const [lod, renderers] of runtime._rendererSets.entries())
      for (const renderer of renderers) meshes.set(renderer, { id, family, lod });
  }

  function bounds(renderer) {
    const { min, max } = renderer.bounds;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) {
          corner.set(x, y, z);
          camera.worldToViewportPoint(corner, projected);
          if (projected.z <= camera.nearClipPlane) return undefined;
          box[0] = Math.min(box[0], projected.x);
          box[1] = Math.min(box[1], projected.y);
          box[2] = Math.max(box[2], projected.x);
          box[3] = Math.max(box[3], projected.y);
        }
    return box.map((value) => Math.max(0, Math.min(1, value)));
  }

  const seen = new Map();
  return {
    async setup(timeHours) {
      navigation.enabled = false;
      orbit.enabled = false;
      lighting.setTuning({ playing: false, timeHours });
      // Wait for the local rock queues to settle before fixing animation time.
      for (let i = 0; i < 12; i++) await frame();
      if (shared?.fading.size) {
        for (let i = 0; i < 90 && shared.fading.size; i++) await frame();
        if (shared.fading.size) throw new Error("Shared rock transitions did not settle");
      }
      for (const [renderer, entry] of shared?.entries ?? []) {
        const index = entry.meshes.indexOf(renderer.mesh);
        if (index < 0) throw new Error("Shared rock mesh is absent from its LOD chain");
        roots.set(renderer, entry.meshes);
        meshes.set(renderer, { id: renderer.entity.parent.name, family: "shared", lod: index });
      }
      const authored = (desert?.instances ?? []).filter((item) => item.family !== "plants");
      for (const item of authored) addGroup(item.runtime, item.entity.name, "desert", () => desert.elapsed);
      for (const cell of vegetation?.cells.values() ?? [])
        for (const plant of cell.plants) {
          if (plant.root.isActiveInHierarchy && vegetation.rockSources?.forInstance(plant.instance))
            addGroup(plant.lod, plant.instance.id, "companion", () => vegetation.time);
        }
      if (!meshes.size) throw new Error("This template has no rock LOD path supported by the probe");
      if ((solids.formations?.length ?? 0) > roots.size)
        throw new Error("Some formations are absent from the shared LOD path");

      engine.time.timeScale = 0;
      if (shared) shared.enabled = false;
      if (desert) desert.enabled = false;
      if (vegetation) vegetation.lodCells.update = () => {};
      const previousFilter = camera.renderFilter;
      camera.renderFilter = (renderer) => {
        if (previousFilter && !previousFilter(renderer)) return false;
        const entry = meshes.get(renderer);
        if (entry && renderer.enabled && renderer.mesh) {
          const triangles = renderer.mesh.subMeshes.reduce((total, subMesh) => total + subMesh.count / 3, 0);
          seen.set(renderer, { ...entry, triangles, bounds: bounds(renderer) });
        }
        return true;
      };
      return {
        template: plan.parameters.worldTemplate?.id || "original",
        seed: plan.parameters.seed,
        camera: [position.x, position.y, position.z],
        forward: [direction.x, direction.y, direction.z],
        verticalFov: camera.fieldOfView,
        aspectRatio: camera.aspectRatio,
        timeHours
      };
    },

    async shot(yaw, mode) {
      transform.worldPosition = position;
      transform.worldRotationQuaternion = rotation;
      if (yaw) {
        const radians = (yaw * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        transform.lookAt(
          new Vector3(
            position.x + direction.x * cos - direction.z * sin,
            position.y + direction.y,
            position.z + direction.x * sin + direction.z * cos
          )
        );
      }
      for (const [renderer, chain] of roots) renderer.mesh = chain[mode === "auto" ? meshes.get(renderer).lod : 0];
      for (const { runtime, clock } of groups) {
        if (mode === "auto") runtime.snapToCurrentLod(clock());
        else runtime.snapWithScreenRelativeHeight(clock(), Number.MAX_SAFE_INTEGER);
      }
      await frame();
      seen.clear();
      await frame();
      return [...seen.values()].map((item) => (mode === "lod0" ? { ...item, lod: 0 } : item));
    }
  };
})();
