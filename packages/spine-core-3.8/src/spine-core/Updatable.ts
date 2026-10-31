/** The interface for items updated by {@link Skeleton#updateWorldTransform()}. */
export interface Updatable {
  update(): void;

  /** Returns false when this item has not been updated because a skin is required and the {@link Skeleton#skin active skin}
   * does not contain this item.
   * @see Skin#getBones()
   * @see Skin#getConstraints() */
  isActive(): boolean;
}
