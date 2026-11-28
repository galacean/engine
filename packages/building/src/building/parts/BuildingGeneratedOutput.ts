import { Component, type Entity } from "@galacean/engine";
/** Runtime output is not authored content. Project persistence saves definitions, never this tree. */
const generatedRoots = new WeakSet<Entity>();
/** The frame owns generated children, so its post-clone hook runs after every
 * child was parsed. A child component must not remove its unparsed siblings. */
class BuildingOutputOwner extends Component {
  _onClone(_target: BuildingOutputOwner, cloneMap: Map<object, object>): void {
    discardClonedBuildingOutput(this.entity, cloneMap);
  }
}
export function markGeneratedBuildingOutput(root: Entity): void {
  generatedRoots.add(root);
  const owner = root.parent;
  if (owner && !owner.getComponent(BuildingOutputOwner)) owner.addComponent(BuildingOutputOwner);
}
/** Only call from the owner's post-clone hook, after its child traversal. */
export function discardClonedBuildingOutput(source: Entity, cloneMap: Map<object, object>): void {
  for (const child of source.children)
    if (generatedRoots.has(child)) {
      const cloned = cloneMap.get(child) as Entity | undefined;
      if (cloned && !cloned.destroyed) cloned.destroy();
    }
}
export function isGeneratedBuildingOutput(root: Entity): boolean {
  return generatedRoots.has(root);
}

/** Generated ancestry, including inactive output, never owns author components. */
export function isInGeneratedBuildingOutput(entity: Entity): boolean {
  for (let node: Entity | null = entity; node; node = node.parent) if (generatedRoots.has(node)) return true;
  return false;
}
