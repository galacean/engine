import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Loader, MeshRenderer } from "@galacean/engine-core";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";
import type { PrefabFile, NormalEntitySchema, ComponentSchema } from "../../../packages/loader/src/scene-format/types";

let engine: WebGLEngine;

Loader.registerClass("MeshRenderer", MeshRenderer);

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  engine = await WebGLEngine.create({ canvas });
});

afterAll(() => {
  engine?.destroy();
});

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

function generateTree(
  depth: number,
  branching: number
): { entities: NormalEntitySchema[]; components: ComponentSchema[]; leafPaths: number[][] } {
  const entities: NormalEntitySchema[] = [];
  const components: ComponentSchema[] = [];
  const leafPaths: number[][] = [];

  function addNode(currentDepth: number, pathFromRoot: number[]): number {
    const idx = entities.length;
    const isLeaf = currentDepth >= depth;

    if (isLeaf) {
      const compIdx = components.length;
      components.push({ type: "MeshRenderer" });
      entities.push({ name: `node_${idx}`, components: [compIdx] });
      leafPaths.push([...pathFromRoot]);
    } else {
      entities.push({ name: `node_${idx}` });
      const childIndices: number[] = [];
      for (let i = 0; i < branching; i++) {
        const childIdx = addNode(currentDepth + 1, [...pathFromRoot, i]);
        childIndices.push(childIdx);
      }
      entities[idx] = { ...entities[idx], children: childIndices };
    }
    return idx;
  }

  addNode(0, []);
  return { entities, components, leafPaths };
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function benchmark(label: string, iterations: number, fn: () => Promise<void>): Promise<number> {
  // warmup
  for (let i = 0; i < 10; i++) await fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const elapsed = performance.now() - start;
  const avg = elapsed / iterations;
  console.log(`[Benchmark] ${label}: ${iterations} iters, total=${elapsed.toFixed(1)}ms, avg=${avg.toFixed(3)}ms`);
  return avg;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Prefab parse benchmark", () => {
  const ITERATIONS = 50;

  // ~3280 nodes
  const LARGE_DEPTH = 7;
  const LARGE_BRANCHING = 3;

  it(`no overrides — large tree (depth=${LARGE_DEPTH}, branching=${LARGE_BRANCHING})`, async () => {
    const { entities, components } = generateTree(LARGE_DEPTH, LARGE_BRANCHING);
    console.log(`[Setup] Tree: ${entities.length} entities, ${components.length} components`);

    const innerPrefabData: PrefabFile = { version: "2.0", refs: [], entities, components, root: 0 };
    const innerPrefab = await PrefabParser.parse(engine, "bench-large-inner.prefab", innerPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["bench-large-inner.prefab"] = innerPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "bench-large-inner.prefab" }],
      entities: [{ name: "outer", children: [1] }, { instance: { asset: 0 } }],
      components: [],
      root: 0
    };

    try {
      const avg = await benchmark(`No overrides (${entities.length} nodes)`, ITERATIONS, async () => {
        const prefab = await PrefabParser.parse(engine, `b-no-${Math.random()}.prefab`, outerPrefabData);
        const instance = prefab.instantiate();
        instance.destroy();
      });
      expect(avg).toBeGreaterThan(0);
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["bench-large-inner.prefab"];
    }
  });

  it(`with 50 overrides — large tree (depth=${LARGE_DEPTH}, branching=${LARGE_BRANCHING})`, async () => {
    const { entities, components, leafPaths } = generateTree(LARGE_DEPTH, LARGE_BRANCHING);

    const innerPrefabData: PrefabFile = { version: "2.0", refs: [], entities, components, root: 0 };
    const innerPrefab = await PrefabParser.parse(engine, "bench-large-ov.prefab", innerPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["bench-large-ov.prefab"] = innerPrefab;

    const overrideLeaves = leafPaths.slice(0, 50);
    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "bench-large-ov.prefab" }],
      entities: [
        { name: "outer", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              entityProps: [
                { path: [], name: "overriddenRoot" },
                ...overrideLeaves.slice(0, 20).map((path) => ({ path, name: "renamed", isActive: false }))
              ],
              componentProps: overrideLeaves.map((path) => ({
                path,
                selector: { type: "MeshRenderer", index: 0 },
                props: { enabled: false }
              }))
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    try {
      const avg = await benchmark(`With 50 overrides (${entities.length} nodes)`, ITERATIONS, async () => {
        const prefab = await PrefabParser.parse(engine, `b-ov-${Math.random()}.prefab`, outerPrefabData);
        const instance = prefab.instantiate();
        instance.destroy();
      });
      expect(avg).toBeGreaterThan(0);
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["bench-large-ov.prefab"];
    }
  });
});
