/** Demo-only invalidation flags. They are not serialized into river assets. */
export enum RiverDirtyFlag {
  None = 0,
  Topology = 1 << 0,
  Geometry = 1 << 1,
  Material = 1 << 2,
  Query = 1 << 3,
  Debug = 1 << 4,
  All = Topology | Geometry | Material | Query | Debug
}
