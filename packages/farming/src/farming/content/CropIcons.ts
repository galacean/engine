import { FARM_CROP_CONTENT } from "./CropContent";
import { createCropIconCatalog } from "./CropIconCatalog";

const urls = import.meta.glob<string>("./icons/*.png", { eager: true, as: "url" });
/** Shared by HTML preview and Galacean UI; only one texture/sprite per crop in the farm. */
const catalog = createCropIconCatalog(FARM_CROP_CONTENT, urls);
export const CROP_ICON_URLS = catalog.urls;
export const cropIconIssues = catalog.issues;
