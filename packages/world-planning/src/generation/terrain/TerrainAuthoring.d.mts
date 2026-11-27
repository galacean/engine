export interface TerrainPoint {
  x: number;
  z: number;
}

export interface TerrainHydrologyResult {
  seed: number;
  rivers: {
    id: string;
    outline: TerrainPoint[];
    bankWidthM: number;
    speed: number;
    mouth?: { section: [[number, number], [number, number]]; transitionLengths: [number, number] };
    points: { id: string; x: number; z: number; elevation: number; width: number; depth: number }[];
  }[];
  lakes: {
    id: string;
    shoreline: { id: string; ring: string; x: number; z: number }[];
    referenceLevel: number;
    levelOffsetM: number;
    depthM: number;
    bankWidthM: number;
  }[];
  counts: { rivers: { target: number; actual: number }; lakes: { target: number; actual: number } };
  diagnostics: { message: string }[];
  heightAt(x: number, z: number): number;
  sample(x: number, z: number): { water: boolean; bank: number };
}

import type { TerrainHydrologyPreview, TerrainIslandShape, TerrainPreviewResult } from "./TerrainIslandTypes";
export type { TerrainIslandShape } from "./TerrainIslandTypes";

export class TerrainIslandGenerationError extends Error {}
export function previewTerrainIsland(shape: TerrainIslandShape): TerrainPreviewResult;
export function generateTerrainIsland(
  shape: TerrainIslandShape,
  grass?: boolean
): {
  heightSamples: number;
  surfaceSamples: number;
  heightmap: Uint8Array<ArrayBuffer>;
  alphamap: Uint8Array<ArrayBuffer>;
  density: Uint8Array<ArrayBuffer>;
  islandCount: number;
  landPolygons: TerrainPoint[][];
  water?: TerrainHydrologyResult;
  hydrology?: TerrainHydrologyPreview;
};
export function generateStylizedTerrainAlbedo(): {
  property: string;
  name: string;
  size: number;
  pixels: Uint8Array<ArrayBuffer>;
}[];

export function generateStylizedTerrainMaps(): Promise<{
  colorField: { size: number; pixels: Uint8Array<ArrayBuffer> };
  clusterNormal: { size: number; pixels: Uint8Array<ArrayBuffer> };
}>;
