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
    mask._addPathMaskWithChildren(entity, "");
    return mask;
  }

  /**
   * Gets the list of path masks.
   */
  get pathMasks(): Readonly<LayerPathMask[]> {
    return this._pathMasks;
  }
  private _pathMasks: LayerPathMask[] = [];
  private _pathMaskMap: Record<string, LayerPathMask> = {};

  /**
   * Adds a path mask to the AnimatorLayerMask.
   * @param path - The path to add a mask for
   */
  addPathMask(path: string): LayerPathMask {
    path = path[0] === "/" ? path.slice(1) : path;

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
  removePathMask(path): void {
    const { _pathMasks: pathMasks } = this;
    path = path[0] === "/" ? path.slice(1) : path;
    for (let i = 0, n = this._pathMasks.length; i < n; ++i) {
      if (pathMasks[i] === path) {
        pathMasks.splice(i, 1);
        delete this._pathMaskMap[path];
        break;
      }
    }
  }

  /**
   * Get a path mask based on the given path.
   * @param path - The path of the mask to get
   */
  getPathMask(path: string): LayerPathMask {
    path = path[0] === "/" ? path.slice(1) : path;
    return this._pathMaskMap[path];
  }

  /**
   * Sets the active state of a path mask.
   * If recursive is true, it also sets the active state of all child path masks.
   * @param path - The path of the mask to modify
   * @param active - The active state to set
   * @param recursive - Whether to apply the active state recursively to child paths
   */
  setPathMaskActive(path: string, active: boolean, recursive: boolean = false): void {
    path = path[0] === "/" ? path.slice(1) : path;
    const pathMask = this._pathMaskMap[path];
    if (pathMask) {
      pathMask.active = active;
    }

    if (recursive) {
      for (let p in this._pathMaskMap) {
        if (p.startsWith(path)) {
          this._pathMaskMap[p].active = active;
        }
      }
    }
  }

  private _addPathMaskWithChildren(entity: Entity, parentPath: string) {
    const children = entity.children;
    for (let i = 0, n = children.length; i < n; ++i) {
      const child = children[i];
      const childPath = parentPath + "/" + child.name;
      this.addPathMask(childPath);
      this._addPathMaskWithChildren(child, childPath);
    }
  }
}
