import { Entity, Matrix, Vector3 } from "@galacean/engine";
import type { BuildingPartComponent } from "./BuildingPartComponent";
import type { BuildingBasePart } from "./BuildingDraft";

/** Mount coordinates belong to the host's canonical wall chart. A separate
 * attachment node may translate that mount; rotation/scale still belong to the
 * host geometry and chosen Unit, not to a second wall chart. */
export function attachmentFrameDefinition(
  part: BuildingPartComponent,
  members: readonly BuildingPartComponent[]
): { definition: BuildingBasePart; host: BuildingPartComponent } {
  const definition = part.definition!;
  const links = part.relations.filter((r) => r.from.part === definition.id);
  const hosts = links.flatMap((r) => {
    const host = members.find((p) => p.definition?.id === r.to.part);
    return host && ["wallProfile", "roofProfile"].includes(host.definition!.support.generator) ? [host] : [];
  });
  if (hosts.length !== 1) throw Error("Attachment requires one explicit profile host: " + definition.id);
  const host = hosts[0],
    delta = attachmentTranslation(part.entity, host.entity);
  if (delta.x === 0 && delta.y === 0 && delta.z === 0) return { definition, host };
  const params = definition.support.params;
  if (host.definition!.support.generator !== "wallProfile" || params.point === undefined)
    throw Error("Move wall Point mounts through their node; UV mounts require editing their support coordinates");
  const shape = host.definition!.support.params;
  const angle = shape.rectangle?.rotation ?? shape.circle.phase,
    c = Math.cos(angle),
    s = Math.sin(angle);
  params.point = [
    params.point[0] + c * delta.x + s * delta.z,
    params.point[1] + delta.y,
    params.point[2] - s * delta.x + c * delta.z
  ];
  return { definition, host };
}

/** Walk only the non-shared hierarchy. In particular, a native child position
 * must not be rounded through a float32 matrix and inverse just to recover it. */
function attachmentTranslation(entity: Entity, host: Entity): Vector3 {
  if (entity === host) return new Vector3();
  const a: Entity[] = [],
    b: Entity[] = [];
  for (let n: Entity | null = entity; n; n = n.parent) a.push(n);
  for (let n: Entity | null = host; n; n = n.parent) b.push(n);
  if (a[a.length - 1] !== b[b.length - 1]) throw Error("Attachment and host must share a node hierarchy");
  while (a.length && b.length && a[a.length - 1] === b[b.length - 1]) {
    a.pop();
    b.pop();
  }
  const point = new Vector3(),
    directions = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
    inverse = new Matrix();
  for (const node of a) {
    const transform = node.transform;
    Vector3.transformNormal(point, transform.localMatrix, point);
    point.add(transform.position);
    for (const direction of directions) Vector3.transformNormal(direction, transform.localMatrix, direction);
  }
  for (let i = b.length - 1; i >= 0; i--) {
    const transform = b[i].transform;
    point.subtract(transform.position);
    Matrix.invert(transform.localMatrix, inverse);
    Vector3.transformNormal(point, inverse, point);
    for (const direction of directions) Vector3.transformNormal(direction, inverse, direction);
  }
  if (
    directions.some((d, i) =>
      [d.x, d.y, d.z].some((value, j) => !Number.isFinite(value) || Math.abs(value - Number(i === j)) > 1e-5)
    ) ||
    ![point.x, point.y, point.z].every(Number.isFinite)
  )
    throw Error("Attachment nodes require a translation relative to their host; edit Unit size/orientation separately");
  return point;
}
