export enum RiverChunkSourceKind {
  Reach = "reach",
  Junction = "junction"
}

/** Stable numeric tags stored in the compiled query-index buffers. */
export enum RiverQueryPrimitiveKind {
  ReachSpan = 0,
  Junction = 1
}
