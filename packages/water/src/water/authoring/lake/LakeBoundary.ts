/** Lake's XZ shoreline and single base datum. Bathymetry and waves are independent. */
export type LakePointXZ = readonly [number, number];

export interface LakeSplinePoint {
  readonly position: LakePointXZ;
  /** Absolute Bezier handles; omitted handles produce a straight segment. */
  readonly incoming?: LakePointXZ;
  readonly outgoing?: LakePointXZ;
}

export interface LakeBoundaryV1 {
  readonly schemaVersion: 1;
  readonly waterLevel: number;
  /** Closed rings without a repeated endpoint. Even/odd fill supports islands and separate basins. */
  readonly rings: readonly (readonly LakeSplinePoint[])[];
  /** Maximum control-polygon distance from a sampled chord, in metres. */
  readonly maxChordError: number;
  readonly maxSegmentLength: number;
  /** Derived boundaries retain Hydrology's query ownership; authored boundaries own query coverage. */
  readonly queryCoverage: "boundary" | "source-grid";
  /** Terrain-basin isoline approximation in metres. Wet-side queries use the actual bed within this band. */
  readonly terrainShorelineTolerance?: number;
}

export interface SampledLakeBoundary {
  readonly waterLevel: number;
  readonly rings: readonly (readonly LakePointXZ[])[];
  readonly queryCoverage: LakeBoundaryV1["queryCoverage"];
  readonly terrainShorelineTolerance?: number;
}
