import type { Sprite } from "@galacean/engine";
import type { FarmUi } from "./FarmUi.ts";

import { CROP_ICON_URLS } from "@galacean/engine-farming/farming/content/CropIcons";

/** Every crop surface shares the very same sprite, including seed bags and inventory items. */
export async function loadCropIcons(ui: FarmUi): Promise<Readonly<Record<string, Sprite>>> {
  const entries = await Promise.all(
    Object.entries(CROP_ICON_URLS).map(async ([id, url]) => [id, await ui.loadIcon(url)] as const)
  );
  return Object.freeze(Object.fromEntries(entries));
}
