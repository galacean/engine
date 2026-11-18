/** Published global roads include the backbone and its derived network connections. */
export function isGlobalRoadId(id: string): boolean {
  return id.startsWith("world-route-") || id.startsWith("road-attachment:");
}
