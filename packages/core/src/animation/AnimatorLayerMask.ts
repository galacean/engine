import { Entity } from "../Entity";
import { LayerPathMask } from "./LayerPathMask";

/**
 * AnimatorLayerMask is used to mask out certain entities from being animated by an AnimatorLayer.
 */
export class AnimatorLayerMask {
  /**
   * Creates an AnimatorLayerMask instance by specifying an entity.
   * This will automatically add path masks for the entity and all its children.
   * @param entity - The root entity to create path masks for
   */
  static createByEntity(entity: Entity): AnimatorLayerMask {
    const mask = new AnimatorLayerMask();
    mask.addPathMask("");
    AnimatorLayerMask._addPathMaskWithChildren(mask, entity, "");
    return mask;
  }

  private static _addPathMaskWithChildren(mask: AnimatorLayerMask, entity: Entity, parentPath: string) {
    const children = entity.children;
    for (let i = 0, n = children.length; i < n; ++i) {
      const child = children[i];
      const childPath = parentPath ? `${parentPath}/${child.name}` : child.name;
      mask.addPathMask(childPath);
      AnimatorLayerMask._addPathMaskWithChildren(mask, child, childPath);
    }
  }

  private _pathMasks: LayerPathMask[] = [];
  private _pathMaskMap: Record<string, LayerPathMask> = {};

  /**
   * The list of path masks.
   */
  get pathMasks(): Readonly<LayerPathMask[]> {
    return this._pathMasks;
  }

  /**
   * Adds a path mask to the AnimatorLayerMask, the root path is "".
   * @param path - The path to add a mask for
   * @returns The created or existing LayerPathMask
   */
  addPathMask(path: string): LayerPathMask {
    const existed = this._pathMaskMap[path];
    if (existed) {
      return existed;
    }

    const pathMask = new LayerPathMask();
    pathMask.path = path;
    pathMask.active = true;
    this._pathMasks.push(pathMask);
    this._pathMaskMap[path] = pathMask;
    return pathMask;
  }

  /**
   * Removes a path mask from the AnimatorLayerMask.
   * @param path - The path of the mask to remove
   */
  removePathMask(path: string): void {
    const { _pathMasks: pathMasks } = this;
    for (let i = 0, n = this._pathMasks.length; i < n; ++i) {
      if (pathMasks[i].path === path) {
        pathMasks.splice(i, 1);
        delete this._pathMaskMap[path];
        break;
      }
    }
  }

  /**
   * Get a path mask based on the given path.
   * @param path - The path of the mask to get
   * @returns The LayerPathMask for the given path
   */
  getPathMask(path: string): LayerPathMask {
    return this._pathMaskMap[path];
  }

  /**
   * Sets the active state of a path mask.
   * If recursive is true, it also sets the active state of all child path masks.
   * @param path - The path of the mask to modify
   * @param active - The active state to set
   * @param withChildren - Whether to apply the active state recursively to child paths
   */
  setPathMaskActive(path: string, active: boolean, withChildren: boolean = false): void {
    const pathMask = this._pathMaskMap[path];
    if (pathMask) {
      pathMask.active = active;
    }

    if (withChildren) {
      for (let p in this._pathMaskMap) {
        if (p.startsWith(path)) {
          this._pathMaskMap[p].active = active;
        }
      }
    }
  }
}
