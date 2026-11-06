import { Entity, Matrix, Quaternion, Vector3 } from "@galacean/engine";

function capture(entity: Entity) {
  return {
    entity,
    position: entity.transform.position.clone(),
    rotation: entity.transform.rotationQuaternion.clone(),
    scale: entity.transform.scale.clone()
  };
}
type RestPose = ReturnType<typeof capture>;

/** Blend the persistent held prefab into the same world-space clip that drives soil/nozzle contacts. */
export class FarmItemWorkMotion {
  private readonly rest: RestPose[] = [];
  private source?: Entity;
  private pairs: { rest: RestPose; source: Entity }[] = [];
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly matrix = new Matrix();
  constructor(private readonly model: Entity) {
    const visit = (entity: Entity) => {
      this.rest.push(capture(entity));
      for (const child of entity.children) visit(child);
    };
    visit(model);
  }
  restore(): void {
    for (const { entity, position, rotation, scale } of this.rest) {
      if (entity.destroyed) continue;
      entity.transform.position = position;
      entity.transform.rotationQuaternion = rotation;
      entity.transform.scale = scale;
    }
  }
  apply(source: Entity, weight: number): void {
    if (this.model.destroyed || source.destroyed) return;
    this.restore();
    if (source !== this.source) {
      this.source = source;
      this.pairs = this.rest.slice(1).flatMap((rest) => {
        const node = source.findByName(rest.entity.name);
        return node ? [{ rest, source: node }] : [];
      });
    }
    const t = Math.max(0, Math.min(1, weight));
    const from = this.model.transform,
      to = source.transform;
    const contactName = ["HoeContact", "RakeContact", "WateringNozzle"].find((name) => this.model.findByName(name));
    const contact = contactName ? this.model.findByName(contactName) : null;
    const sourceContact = contactName ? source.findByName(contactName) : null;
    Vector3.lerp(from.worldPosition, to.worldPosition, t, this.position);
    this.scale.copyFrom(from.lossyWorldScale);
    Quaternion.slerp(from.worldRotationQuaternion, to.worldRotationQuaternion, t, this.rotation);
    Matrix.affineTransformation(this.scale, this.rotation, this.position, this.matrix);
    from.worldMatrix = this.matrix;
    for (const { rest, source: node } of this.pairs) {
      Vector3.lerp(rest.position, node.transform.position, t, this.position);
      this.scale.copyFrom(rest.scale);
      Quaternion.slerp(rest.rotation, node.transform.rotationQuaternion, t, this.rotation);
      rest.entity.transform.position = this.position;
      rest.entity.transform.scale = this.scale;
      rest.entity.transform.rotationQuaternion = this.rotation;
    }
    if (contact && sourceContact) {
      Vector3.subtract(sourceContact.transform.worldPosition, contact.transform.worldPosition, this.position);
      this.position.scale(t).add(from.worldPosition);
      from.worldPosition = this.position;
    }
  }
}
