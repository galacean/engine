import { Pointer } from "./Pointer";

export interface IEventHandler {
  /**
   * Called when the pointer is down while over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerDown(event: Pointer): void;

  /**
   * Called when the pointer is up while over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerUp(event: Pointer): void;

  /**
   * Called when the pointer is down and up with the same collider.
   * @param pointer - The pointer that triggered
   */
  onPointerClick(event: Pointer): void;

  /**
   * Called when the pointer is enters the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerEnter(event: Pointer): void;

  /**
   * Called when the pointer is no longer over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerExit(event: Pointer): void;

  /**
   * Called when the pointer is down while over the ColliderShape and is still holding down.
   * @param pointer - The pointer that triggered
   * @remarks onPointerDrag is called every frame while the pointer is down.
   */
  onPointerDrag(pointer: Pointer): void;
}
