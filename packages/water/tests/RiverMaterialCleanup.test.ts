import { afterEach, expect, it, vi } from "vitest";
import {
  RiverRuntimeController,
  RiverRuntimeSubmissionCancelledError
} from "../src/water/runtime/river/RiverRuntimeController";
import { RiverChunkSourceKind } from "../src/water/compiler/river/RiverGeometryEnums";
import { RiverNetworkQueryService } from "../src/water/runtime/river/RiverQueryService";
import * as factory from "../src/water/runtime/river/RiverMaterialFactory";

// GPU allocation is outside these lifecycle tests; keep the real controller and cleanup paths.
vi.mock("../src/water/runtime/river/RiverMaterialFactory", async (importOriginal) => ({
  ...(await importOriginal<typeof factory>()),
  createRiverMaterial: vi.fn(),
  createRiverLocalMapMaterial: vi.fn(),
  setRiverSurfaceDepthWriteEnabled: vi.fn(),
  setRiverSurfaceFeatureFlags: vi.fn(),
  setRiverSurfaceTimeOverride: vi.fn(),
  setRiverSurfaceOpticsBinding: vi.fn(() => ({ effectiveSource: "none" })),
  setRiverScreenSpaceReflectionReceiver: vi.fn()
}));

vi.mock("../src/water/runtime/river/RiverQueryService", () => ({
  RiverNetworkQueryService: vi.fn(function () {})
}));
vi.mock("../src/water/runtime/river/RiverWaterSpatialFieldProvider", () => ({
  getRiverWaterSpatialBounds: vi.fn(() => ({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 })),
  RiverWaterSpatialFieldProvider: vi.fn(function () {
    return { destroy: vi.fn() };
  })
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function material(name: string) {
  return {
    name,
    destroyed: false,
    destroy: vi.fn(function (this: { destroyed: boolean }) {
      this.destroyed = true;
      return true;
    })
  };
}

function entity(name = "root") {
  const root: any = {
    name,
    destroyed: false,
    children: [],
    renderers: [],
    createChild: vi.fn((name: string) => {
      const child = entity(name);
      child.parent = root;
      return child;
    }),
    destroy: vi.fn(() => {
      root.destroyed = true;
    }),
    getComponentsIncludeChildren: vi.fn((_type, results) => {
      const visit = (node) => {
        results.push(...node.renderers);
        for (const child of node.children) visit(child);
      };
      visit(root);
      return results;
    })
  };
  let parent: any;
  Object.defineProperty(root, "parent", {
    get: () => parent,
    set: (value) => {
      if (parent) parent.children.splice(parent.children.indexOf(root), 1);
      parent = value;
      if (parent && !parent.children.includes(root)) parent.children.push(root);
    }
  });
  return root;
}

function renderer(root, ...materials) {
  const bound = [...materials];
  const value = {
    getMaterials: vi.fn(() => bound),
    setMaterial: vi.fn((index, value) => (bound[index] = value))
  };
  root.renderers.push(value);
  return value;
}

function reach(root, index: number) {
  return {
    root: root.createChild(`reach-${index}`),
    config: { material: { preset: "river" }, index },
    artifact: { index },
    materials: { surface: material(`surface-${index}`), surfaceLocalMap: material(`local-${index}`) }
  };
}

function runtimeSet(root, reaches) {
  return {
    root,
    reaches,
    chunks: [] as {
      compiled: unknown;
      root: ReturnType<typeof entity>;
      meshes: object;
      surfaceRenderer: ReturnType<typeof renderer>;
    }[],
    connectionBinding: { unbind: vi.fn(), destroy: vi.fn() },
    ownedConnections: new Set(),
    ownedTextures: new Set(),
    spatialFieldProvider: { destroy: vi.fn() },
    resource: { release: vi.fn() }
  };
}

function fixture() {
  const root = entity();
  // Private access isolates construction from GPU work while executing real rollback/retirement.
  const controller: any = new RiverRuntimeController({} as any, root);
  vi.spyOn(controller, "_refreshSurfaceClock").mockImplementation(() => {});
  return { root, controller };
}

it("retires a multi-Reach tree once, including Junction and all slots, preserving unrelated materials", () => {
  const { root, controller } = fixture();
  const reaches = [reach(root, 0), reach(root, 1), reach(root, 2)];
  const author = material("author"),
    unrelated = material("unrelated");
  const renderers = reaches.map((r) => renderer(r.root, r.materials.surface, author, r.materials.surfaceLocalMap));
  const junction = renderer(root.createChild("junction"), reaches[0].materials.surfaceLocalMap, unrelated);
  const set = runtimeSet(root, reaches);
  controller._runtimeSets.set("river", set);
  controller.destroy();
  expect(root.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
  for (const value of [...renderers, junction]) expect(value.getMaterials).toHaveBeenCalledTimes(1);
  for (const value of renderers) expect(value.getMaterials()).toEqual([null, author, null]);
  expect(junction.getMaterials()).toEqual([null, unrelated]);
  for (const r of reaches) for (const m of Object.values(r.materials)) expect(m.destroy).toHaveBeenCalledTimes(1);
  expect(author.destroy).not.toHaveBeenCalled();
  expect(unrelated.destroy).not.toHaveBeenCalled();
  expect(set.connectionBinding.unbind).toHaveBeenCalledTimes(6);
  expect(set.resource.release).toHaveBeenCalledTimes(1);
});

it("continues material and runtime cleanup and aggregates independent failures", () => {
  const { root, controller } = fixture();
  const reaches = [reach(root, 0), reach(root, 1)];
  const set = runtimeSet(root, reaches);
  const unbindError = new Error("unbind"),
    destroyError = new Error("destroy"),
    releaseError = new Error("release");
  set.connectionBinding.unbind.mockImplementationOnce(() => {
    throw unbindError;
  });
  reaches[0].materials.surface.destroy.mockImplementationOnce(() => {
    throw destroyError;
  });
  set.resource.release.mockImplementationOnce(() => {
    throw releaseError;
  });
  controller._runtimeSets.set("river", set);
  let failure: any;
  try {
    controller.destroy();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  const flatten = (error): unknown[] => (error instanceof AggregateError ? error.errors.flatMap(flatten) : [error]);
  expect(flatten(failure)).toEqual([unbindError, destroyError, releaseError]);
  expect(root.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
  expect(set.connectionBinding.unbind).toHaveBeenCalledTimes(4);
  expect(reaches[1].materials.surfaceLocalMap.destroy).toHaveBeenCalledTimes(1);
  expect(set.spatialFieldProvider.destroy).toHaveBeenCalledTimes(1);
  expect(root.destroy).toHaveBeenCalledTimes(1);
});

it("continues detaching other slots and renderers when one borrower fails to release", () => {
  const { root, controller } = fixture();
  const reaches = [reach(root, 0), reach(root, 1)];
  const first = renderer(root, reaches[0].materials.surface, reaches[0].materials.surfaceLocalMap);
  const second = renderer(root, reaches[1].materials.surface);
  const original = new Error("borrow release");
  first.setMaterial.mockImplementationOnce(() => {
    throw original;
  });
  reaches[0].materials.surface.destroy.mockReturnValueOnce(false);
  const set = runtimeSet(root, reaches);
  controller._runtimeSets.set("river", set);
  let failure: any;
  try {
    controller.destroy();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors[0]).toBe(original);
  expect(failure.errors[1].message).toContain("still has live borrowers");
  expect(first.getMaterials()).toEqual([reaches[0].materials.surface, null]);
  expect(second.getMaterials()).toEqual([null]);
  expect(set.resource.release).toHaveBeenCalledTimes(1);
  expect(root.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
});

it("reports a remaining live borrower while still cleaning the other materials and resource", () => {
  const { root, controller } = fixture();
  const reaches = [reach(root, 0)];
  reaches[0].materials.surface.destroy.mockReturnValueOnce(false);
  const set = runtimeSet(root, reaches);
  controller._runtimeSets.set("river", set);
  expect(() => controller.destroy()).toThrow("Water render material 'surface-0' still has live borrowers.");
  expect(reaches[0].materials.surfaceLocalMap.destroy).toHaveBeenCalledTimes(1);
  expect(set.resource.release).toHaveBeenCalledTimes(1);
});

it("batches synchronous construction rollback after chunks have borrowed Reach materials", () => {
  const { root, controller } = fixture();
  let reaches, candidateRoot;
  vi.spyOn(controller, "_createReaches").mockImplementation((_data, runtimeRoot) => {
    candidateRoot = runtimeRoot;
    return (reaches = [reach(runtimeRoot, 0), reach(runtimeRoot, 1)]);
  });
  const original = new Error("chunk upload");
  vi.spyOn(controller, "_createChunk")
    .mockImplementationOnce(() => {
      const chunkRoot = candidateRoot.createChild("junction");
      renderer(chunkRoot, reaches[0].materials.surface, reaches[1].materials.surfaceLocalMap);
      return { root: chunkRoot, meshes: {} };
    })
    .mockImplementationOnce(() => {
      throw original;
    });
  const resource = {
    data: { sourceId: "candidate", terrainInteraction: {}, chunks: [{}, {}] },
    retain: vi.fn(),
    release: vi.fn()
  };
  expect(() => controller.replaceActive("river", resource)).toThrow(original);
  expect(candidateRoot.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
  for (const r of reaches)
    for (const m of Object.values(r.materials) as any[]) expect(m.destroy).toHaveBeenCalledTimes(1);
  expect(candidateRoot.destroy).toHaveBeenCalledTimes(1);
  expect(resource.release).toHaveBeenCalledTimes(1);
});

it.each(["create", "bind"])("reclaims completed and partial material pairs when Reach %s fails", (failureAt) => {
  const { root, controller } = fixture();
  controller._surfaceAppearanceBinding = {
    appearance: { depthResponse: { model: "unused" } },
    renderContract: {
      optics: { profile: { scatteringColor: [0, 0, 0], scatteringCoefficient: 0 } },
      look: { foam: { color: "#fff", enabled: false } }
    }
  };
  controller._surfaceOpticsBinding = {};
  const created = Array.from({ length: failureAt === "create" ? 3 : 4 }, (_, index) => material(`partial-${index}`));
  const original = new Error("creation failed");
  vi.mocked(factory.createRiverMaterial)
    .mockReturnValueOnce(created[0] as any)
    .mockReturnValueOnce(created[2] as any);
  vi.mocked(factory.createRiverLocalMapMaterial).mockReturnValueOnce(created[1] as any);
  if (failureAt === "create")
    vi.mocked(factory.createRiverLocalMapMaterial).mockImplementationOnce(() => {
      throw original;
    });
  else vi.mocked(factory.createRiverLocalMapMaterial).mockReturnValueOnce(created[3] as any);
  const binding = {
    bind: vi.fn((m) => {
      if (failureAt === "bind" && m === created[3]) throw original;
    }),
    unbind: vi.fn()
  };
  const config = { material: { preset: "river" } };
  expect(() =>
    controller._createReaches({ reaches: [{ config }, { config }] }, root, [{ config }, { config }], {}, binding)
  ).toThrow(original);
  expect(root.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
  expect(binding.unbind).toHaveBeenCalledTimes(created.length);
  for (const m of created) expect(m.destroy).toHaveBeenCalledTimes(1);
});

async function incrementalFixture() {
  const f = fixture();
  const oldRoot = f.root.createChild("old");
  const reaches = [reach(oldRoot, 0), reach(oldRoot, 1), reach(oldRoot, 2)];
  const data = {
    sourceId: "river",
    connections: [],
    surfaceMotion: {},
    terrainInteraction: {},
    reaches: reaches.map((r, index) => ({ id: String(index), config: r.config, artifact: r.artifact })),
    chunks: reaches.map((_, index) => ({
      id: String(index),
      materialSourceReachIndex: index,
      sourceKind: RiverChunkSourceKind.Junction
    }))
  };
  const old = runtimeSet(oldRoot, reaches);
  Object.assign(old.resource, { data });
  old.chunks = data.chunks.map((compiled, index) => {
    const chunkRoot = oldRoot.createChild(`junction-${index}`);
    return {
      compiled,
      root: chunkRoot,
      meshes: {},
      surfaceRenderer: renderer(chunkRoot, reaches[index].materials.surface)
    };
  });
  const borrowedRenderer = old.chunks[0].surfaceRenderer;
  f.controller._runtimeSets.set("river", old);
  const nextData = {
    ...data,
    reaches: data.reaches.map((r, index) => (index === 0 ? r : { ...r, config: { ...r.config, changed: true } }))
  };
  const resource = { data: nextData, identity: {}, retain: vi.fn(), release: vi.fn() };
  const created: any[] = [];
  vi.spyOn(f.controller, "_createReaches").mockImplementation(
    (_data, root, _sources, _texture, _binding, indices: any) => {
      const value = reach(root, indices[0]);
      created.push(value);
      return [value];
    }
  );
  vi.spyOn(f.controller, "_createChunk").mockImplementation((_id, compiled: any, current: any, root: any) => {
    const chunkRoot = root.createChild(`new-${compiled.id}`);
    return {
      compiled,
      root: chunkRoot,
      meshes: {},
      surfaceRenderer: renderer(chunkRoot, current[compiled.materialSourceReachIndex].materials.surface)
    };
  });
  return { ...f, old, reaches: [...reaches], borrowedRenderer, resource, created };
}

it.each(["cancel", "error"])(
  "preserves reused Reach borrowers while batching incremental %s rollback",
  async (mode) => {
    const f = await incrementalFixture();
    const original = new Error("query construction");
    if (mode === "error")
      vi.mocked(RiverNetworkQueryService).mockImplementationOnce(function () {
        throw original;
      });
    let cancel = false;
    const createChunk = f.controller._createChunk;
    vi.spyOn(f.controller, "_createChunk").mockImplementation((...args) => {
      const chunk = createChunk(...args);
      if (mode === "cancel" && f.created.length === 2) cancel = true;
      return chunk;
    });
    const result = f.controller.replaceActiveIncremental("river", f.resource, undefined, {
      now: () => 0,
      shouldCancel: () => cancel
    });
    if (mode === "cancel") await expect(result).rejects.toBeInstanceOf(RiverRuntimeSubmissionCancelledError);
    else await expect(result).rejects.toBe(original);
    const candidate = f.root.children[1];
    expect(candidate.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
    expect(f.old.root.getComponentsIncludeChildren).not.toHaveBeenCalled();
    expect(f.borrowedRenderer.getMaterials()).toEqual([f.reaches[0].materials.surface]);
    for (const m of Object.values(f.reaches[0].materials) as any[]) expect(m.destroy).not.toHaveBeenCalled();
    for (const r of f.created)
      for (const m of Object.values(r.materials) as any[]) expect(m.destroy).toHaveBeenCalledTimes(1);
    expect(f.old.resource.release).not.toHaveBeenCalled();
    expect(f.resource.release).toHaveBeenCalledTimes(1);
  }
);

it("keeps reused Reach materials and Junction borrowers alive during successful incremental retirement", async () => {
  const f = await incrementalFixture();
  await f.controller.replaceActiveIncremental("river", f.resource, undefined, { now: () => 0 });
  expect(f.old.root.getComponentsIncludeChildren).toHaveBeenCalledTimes(1);
  expect(f.root.children[1].getComponentsIncludeChildren).not.toHaveBeenCalled();
  expect(f.borrowedRenderer.getMaterials()).toEqual([f.reaches[0].materials.surface]);
  for (const m of Object.values(f.reaches[0].materials) as any[]) {
    expect(m.destroy).not.toHaveBeenCalled();
    expect(f.old.connectionBinding.unbind).not.toHaveBeenCalledWith(m);
  }
  for (const r of f.reaches.slice(1))
    for (const m of Object.values(r.materials) as any[]) expect(m.destroy).toHaveBeenCalledTimes(1);
  for (const r of f.created)
    for (const m of Object.values(r.materials) as any[]) expect(m.destroy).not.toHaveBeenCalled();
  expect(f.old.resource.release).toHaveBeenCalledTimes(1);
  expect(f.resource.release).not.toHaveBeenCalled();
});
