import { RegionAttachment } from "./RegionAttachment";
import { Skin } from "../Skin";
import { BoundingBoxAttachment } from "./BoundingBoxAttachment";
import { PathAttachment } from "./PathAttachment";
import { PointAttachment } from "./PointAttachment";
import { ClippingAttachment } from "./ClippingAttachment";
import { MeshAttachment } from "./MeshAttachment";

/** The interface which can be implemented to customize creating and populating attachments.
 *
 * See [Loading skeleton data](http://esotericsoftware.com/spine-loading-skeleton-data#AttachmentLoader) in the Spine
 * Runtimes Guide. */
export interface AttachmentLoader {
  /** @return May be null to not load an attachment. */
  newRegionAttachment(skin: Skin, name: string, path: string): RegionAttachment;

  /** @return May be null to not load an attachment. */
  newMeshAttachment(skin: Skin, name: string, path: string): MeshAttachment;

  /** @return May be null to not load an attachment. */
  newBoundingBoxAttachment(skin: Skin, name: string): BoundingBoxAttachment;

  /** @return May be null to not load an attachment */
  newPathAttachment(skin: Skin, name: string): PathAttachment;

  /** @return May be null to not load an attachment */
  newPointAttachment(skin: Skin, name: string): PointAttachment;

  /** @return May be null to not load an attachment */
  newClippingAttachment(skin: Skin, name: string): ClippingAttachment;
}
