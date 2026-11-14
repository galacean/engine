import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { DirectorNetwork, buildWalkTrack } from "@galacean/engine-world-planning/spatial/director/DirectorRoute";
import { TerrainNavigator } from "@galacean/engine-world-planning/spatial/director/TerrainNavigator";
import { adoptPlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { publishedRoadJourney } from "./RoadJourneys.ts";
import settings from "@galacean/engine-world-planning/spatial/director/navigation.json";

let plan: IslandPlan;
let network: TerrainNavigator;
let roads: DirectorNetwork | undefined;
const cache = new Map<string, unknown>();
self.onmessage = ({ data }) => {
  const { id, kind } = data;
  try {
    if (kind === "world") {
      plan = data.plan;
      if (data.heightmap) adoptPlanningHeightmap(plan, data.heightmap);
      network = new TerrainNavigator(plan);
      roads = undefined;
      cache.clear();
      self.postMessage({ id, value: { ready: true } });
    } else if (kind === "endpoint") {
      self.postMessage({ id, value: network.resolve(data.endpoint) });
    } else {
      const key = JSON.stringify([data.from, data.to, data.speed, data.roadOnly, data.routeId]);
      if (!cache.has(key)) {
        let route =
          data.roadOnly && data.routeId
            ? publishedRoadJourney(plan, data.routeId, data.from.id, data.to.id)
            : undefined;
        if (!route && data.from.kind === "poi" && data.to.kind === "poi") {
          roads ??= new DirectorNetwork(plan);
          try {
            route = roads.route(data.from.id, data.to.id);
          } catch (error) {
            if (data.roadOnly) throw error;
          }
        }
        if (!route) {
          if (data.roadOnly) throw Error("道路验收仅支持已有道路连接的POI");
          route = network.route(data.from, data.to);
        }
        cache.set(key, { route, track: buildWalkTrack(plan, route, data.speed) });
        if (cache.size > settings.cacheRoutes) cache.delete(cache.keys().next().value!);
      }
      self.postMessage({ id, value: cache.get(key) });
    }
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
