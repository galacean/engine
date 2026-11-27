import type { ReferResource } from "@galacean/engine";

/** Only exclusively owned resources may enter this list; detach their borrowers first. */
export function destroyPhotoResources(resources: readonly (ReferResource | undefined)[], release?: () => void): void {
  for (const resource of resources) resource?.destroy(true);
  // Engine drains deferred destruction before returning from its synchronous frame.
  // Keep the reservation during the rest of that frame, including any other capture.
  if (release) {
    if (resources.every((resource) => !resource || resource.destroyed)) release();
    else queueMicrotask(release);
  }
}
