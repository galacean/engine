import { expect, it } from "vitest";
import {
  compileWaterConnectionGraph,
  type WaterConnectionAuthoringBody
} from "../src/water/native/WaterConnectionAuthoring";
import { createWaterCreationPreset } from "../src/water/native/WaterCreationPresets";

function graph(second: "lake" | "river" | "ocean" = "lake"): WaterConnectionAuthoringBody[] {
  const terrain = {
    id: "connection-bed",
    revision: 1,
    origin: [-32, -32] as const,
    spacing: 1,
    columns: 65,
    rows: 65,
    heights: Array(65 * 65).fill(-2)
  };
  return [
    {
      id: "a",
      shape: createWaterCreationPreset("lake").shape,
      terrain,
      connections: [
        {
          id: "join",
          targetId: "b",
          section: [
            [0, -1],
            [0, 1]
          ],
          transitionLengths: [1, 1]
        }
      ]
    },
    { id: "b", shape: createWaterCreationPreset(second).shape, terrain, connections: [] }
  ];
}

it.each(["lake", "river", "ocean"] as const)(
  "compiles a pure lake/%s graph without modifying author inputs",
  (kind) => {
    const input = graph(kind),
      before = JSON.stringify(input);
    const result = compileWaterConnectionGraph(input);
    expect(result.count).toBe(1);
    expect(result.byBody.a).toHaveLength(1);
    expect(result.byBody.b).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
  }
);

it("rejects mismatched levels and accepted beds before runtime construction", () => {
  const input = graph();
  expect(() =>
    compileWaterConnectionGraph([
      input[0],
      { ...input[1], shape: { ...input[1].shape, kind: "lake", referenceLevel: 0, levelOffsetM: 0.1 } as any }
    ])
  ).toThrow("aligned water levels");
  expect(() =>
    compileWaterConnectionGraph([
      input[0],
      { ...input[1], terrain: { ...input[1].terrain, heights: Array(65 * 65).fill(-3) } }
    ])
  ).toThrow("different accepted Terrain");
});

it("rejects sections outside the authored shoreline and incomplete shore-field terrain", () => {
  const input = graph();
  expect(() =>
    compileWaterConnectionGraph([
      {
        ...input[0],
        connections: [
          {
            ...input[0].connections[0],
            section: [
              [20, -1],
              [20, 1]
            ]
          }
        ]
      },
      input[1]
    ])
  ).toThrow("outside");
  const terrain = {
    ...input[0].terrain,
    origin: [-8, -8] as const,
    columns: 17,
    rows: 17,
    heights: Array(17 * 17).fill(-2)
  };
  expect(() => compileWaterConnectionGraph(input.map((body) => ({ ...body, terrain })))).toThrow("Terrain");
});

it("rejects invalid graph identity, targets and section geometry", () => {
  const input = graph();
  expect(() => compileWaterConnectionGraph([input[0], input[0]])).toThrow("unique");
  expect(() => compileWaterConnectionGraph([input[0]])).toThrow("target");
  expect(() =>
    compileWaterConnectionGraph([
      {
        ...input[0],
        connections: [
          {
            ...input[0].connections[0],
            section: [
              [0, 0],
              [0, 0]
            ]
          }
        ]
      },
      input[1]
    ])
  ).toThrow("section");
});
