export enum RiverChunkSourceKind {
  Reach = "reach",
  Junction = "junction"
}

/** Stable numeric tags stored in the compiled query-index buffers. */
export enum RiverQueryPrimitiveKind {
  ReachSpan = 0,
  Junction = 1
}

export enum RiverTerrainSurfaceOwnership {
  ExternalTerrainSystem = "externalTerrainSystem"
}

export enum RiverTerrainMaskChannel {
  RiverBedCarve = "riverBedCarve",
  BankWetnessSdf = "bankWetnessSdf",
  VegetationExclusion = "vegetationExclusion",
  BuildingExclusion = "buildingExclusion"
}

export enum RiverLocalMapRegionKind {
  Confluence = "confluence"
}

export enum RiverPackedLocalMapChannel {
  FlowX = "flowX",
  FlowZ = "flowZ",
  Foam = "foam",
  SignedDistance = "signedDistance"
}
