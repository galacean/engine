import { validateWaterWorldTransform } from "./WaterAuthoring";
import type { WaterBodyComponent, WaterBodyConfiguration } from "./WaterBodyComponent";
import { WaterBodyResource } from "./WaterResources";
import { compileWaterConnectionFields, waterConnectionFacts } from "./WaterConnectionAuthoring";
import type { WaterConnectionPort, WaterConnectionV1 } from "../authoring/connections/WaterConnection";
import { hashStableValue } from "../compiler/shared/determinism";
import { createWaterBodyAsset } from "../authoring/body/WaterBodyAsset";

/** A connection has one author, and refers to the other component through the native Source codec. */
export interface WaterBodyConnection {
  readonly id: string;
  readonly target: WaterBodyComponent;
  readonly section: WaterConnectionV1["section"];
  readonly transitionLengths: WaterConnectionV1["transitionLengths"];
}

interface Input {
  body: WaterBodyComponent;
  configuration: Readonly<WaterBodyConfiguration>;
}
const baseContent = new WeakMap<WaterBodyResource, string>();
const connectionCache = new WeakMap<
  WaterBodyComponent,
  { key: string; ports: Readonly<Record<string, readonly WaterConnectionPort[]>> }
>();

/** Reconcile the entire affected static group against accepted beds before one native publication. */
export function compileNativeWaterConnections(inputs: readonly Input[]): Input[] {
  const byBody = new Map(inputs.map((input) => [input.body, input]));
  const connections: WaterConnectionV1[] = [],
    connected = new Set<WaterBodyComponent>();
  for (const { body } of inputs) {
    if (!body.enabled || !body.entity.isActiveInHierarchy) continue;
    for (const connection of body.authoring?.connections ?? []) {
      const target = connection.target;
      // Detached or destroyed targets have no active connection. This must be
      // checked before membership: author references can survive editor undo.
      if (target.destroyed || target.pendingDestroy || !target.enabled || !target.entity.isActiveInHierarchy) continue;
      if (!byBody.has(target))
        throw new Error(
          `MISSING_DEPENDENCY: Water '${body.waterId}' connection '${connection.id}' has no Source target.`
        );
      for (const member of [body, target]) {
        const t = member.entity.transform,
          p = t.worldPosition,
          q = t.worldRotationQuaternion,
          s = t.lossyWorldScale;
        validateWaterWorldTransform("lake", true, {
          position: [p.x, p.y, p.z],
          rotationQuaternion: [q.x, q.y, q.z, q.w],
          scale: [s.x, s.y, s.z]
        });
        connected.add(member);
      }
      connections.push({
        id: `${body.waterId}:${connection.id}`,
        bodies: [body.waterId, target.waterId],
        section: connection.section,
        transitionLengths: connection.transitionLengths
      });
    }
  }
  const group = [...connected].sort((a, b) => a.waterId.localeCompare(b.waterId));
  const key = hashStableValue([
    connections,
    group.map((body) => {
      const asset = byBody.get(body)!.configuration.asset;
      return [body.waterId, baseContent.get(asset) ?? asset.contentHash];
    })
  ]);
  let ports: Readonly<Record<string, readonly WaterConnectionPort[]>> = {};
  const cached = group.length && connectionCache.get(group[0]);
  if (cached && cached.key === key) ports = cached.ports;
  else if (connections.length) {
    const fields = group.map((body) => {
      const input = byBody.get(body)!;
      return waterConnectionFacts(
        body.waterId,
        body.authoring!.shape,
        input.configuration.asset.data,
        body._terrainSnapshot()
      );
    });
    ports = compileWaterConnectionFields(connections, fields).byBody;
    connectionCache.set(group[0], { key, ports });
  }
  return inputs.flatMap(({ body, configuration }) => {
    const asset = configuration.asset.data,
      source = asset.source as { descriptor: Record<string, unknown> };
    const next: readonly WaterConnectionPort[] | undefined = ports[body.waterId];
    // Ocean owns connection ports in its source config; River/Lake own them on the descriptor.
    // Use the same location for comparison, publication and removal so disconnect also retires old ports.
    const container =
      asset.kind === "ocean" ? (source.descriptor.config as Record<string, unknown>) : source.descriptor;
    if (hashStableValue(container.connections ?? []) === hashStableValue(next ?? [])) return [];
    const { connections: _old, ...base } = container;
    const connected = { ...base, ...(next?.length ? { connections: next } : {}) };
    const connectedSource = {
      ...source,
      descriptor: asset.kind === "ocean" ? { ...source.descriptor, config: connected } : connected
    };
    const resource = new WaterBodyResource(
      body.engine,
      createWaterBodyAsset({ ...asset, source: connectedSource, sourceHash: hashStableValue(connectedSource) })
    );
    baseContent.set(resource, baseContent.get(configuration.asset) ?? configuration.asset.contentHash);
    body._ownCompiledAsset(resource);
    return [{ body, configuration: { ...configuration, asset: resource } }];
  });
}
