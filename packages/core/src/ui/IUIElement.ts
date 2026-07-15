import { Ray, Vector3, Vector4 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { IUICanvas } from "./IUICanvas";

/**
 * Flags describing a root-canvas level modification, broadcast to its elements.
 */
export enum RootCanvasModifyFlags {
  None = 0x0,
  ReferenceResolutionPerUnit = 0x1,
  All = 0x1
}

/**
 * Entity modify flags dispatched by UI components, extending `EntityModifyFlags`.
 */
export enum EntityUIModifyFlags {
  CanvasEnableInScene = 0x4,
  GroupEnableInScene = 0x8
}

/**
 * Flags describing a UI group modification, broadcast to its elements.
 */
export enum GroupModifyFlags {
  None = 0x0,
  GlobalAlpha = 0x1,
  GlobalInteractive = 0x2,
  All = 0x3
}

/**
 * An element owned by a root UI canvas: tracks its canvas and listens to hierarchy changes.
 * Underscore members are engine-internal plumbing maintained by the canvas and `UIElementUtils`.
 */
export interface IUIElement {
  entity: Entity;
  _rootCanvas: IUICanvas;
  _indexInRootCanvas: number;
  _rootCanvasListeningEntities: Entity[];
  _isRootCanvasDirty: boolean;

  _getRootCanvas(): IUICanvas;
  _rootCanvasListener: (flag: number, param?: any) => void;
  _onRootCanvasModify?(flag: RootCanvasModifyFlags): void;
}

/**
 * A UI group: cascades alpha/interactive state to its elements.
 */
export interface IUIGroup {
  entity: Entity;
  /** Marker used to identify a group component without a ui-package dependency. */
  _isUIGroup: boolean;
  _disorderedElements: { length: number; add(element: any): void; deleteByIndex(index: number): any };
  _getGlobalAlpha(): number;
}

/**
 * An element that can belong to a UI group.
 */
export interface IUIGroupAble extends IUIElement {
  _group: IUIGroup;
  _indexInGroup: number;
  _groupListeningEntities: Entity[];
  _isGroupDirty: boolean;

  _globalAlpha?: number;
  _globalInteractive?: boolean;

  _getGroup(): IUIGroup;
  _onGroupModify(flag: GroupModifyFlags, isPass?: boolean): void;
  _groupListener(flag: number): void;
}

/**
 * The raycast hit output a canvas-hosted renderer fills.
 */
export interface IUIHitResult {
  entity: Entity;
  distance: number;
  point: Vector3;
  normal: Vector3;
  component: any;
}

/**
 * A renderer that is not a ui-package `UIRenderer` but can be hosted by a `UICanvas`:
 * when placed under a root canvas it is collected, ordered, group-faded, rect-clipped and
 * hit-tested by the canvas instead of rendering through the camera pipeline.
 *
 * @remarks
 * Implementers switch their own `ComponentsManager` renderer registration off while hosted
 * and push their render elements into `IUICanvas._renderElements` from `_render`.
 */
export interface IUIHostedRenderer extends IUIGroupAble {
  /** Marker checked by the canvas walk. */
  _isUIHostedRenderer: boolean;

  raycastEnabled: boolean;
  _raycast(ray: Ray, out: IUIHitResult, distance: number): boolean;

  /** Rect masks assigned by the canvas walk (ui `RectMask2D` instances). */
  _rectMasks: any[];
  _rectMaskRect: Vector4;
  _rectMaskSoftness: Vector4;
  _rectMaskEnabled: boolean;
  _rectMaskHardClip: boolean;
  _setRectMasks(rectMasks: any[], count: number): void;
}
