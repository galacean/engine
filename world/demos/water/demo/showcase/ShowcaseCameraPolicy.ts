export type ShowcaseCameraMode = "free" | "fixed" | "tour";
export type ShowcaseCameraScene = "river" | "grasslands" | "ocean";

export const SHOWCASE_CAMERA_MOVEMENT_SPEED = Object.freeze({
  river: 16,
  grasslands: 14,
  ocean: 50
} satisfies Readonly<Record<ShowcaseCameraScene, number>>);

const AUTOMATED_CAMERA_PARAMETERS = Object.freeze(["acceptance", "visual"] as const);

export function isShowcaseAutomation(search: Pick<URLSearchParams, "get">): boolean {
  return AUTOMATED_CAMERA_PARAMETERS.some((parameter) => search.get(parameter) === "1");
}

/**
 * Automation keeps authored camera poses deterministic. Callers may opt into a
 * tour-first presentation while the shared default remains free roaming.
 */
export function resolveShowcaseCameraMode(
  search: Pick<URLSearchParams, "get">,
  supportsTour = false,
  defaultMode: ShowcaseCameraMode = "free"
): ShowcaseCameraMode {
  if (isShowcaseAutomation(search)) return "fixed";
  if (supportsTour && search.get("tour") === "1") return "tour";
  if (search.get("tour") === "0") return "free";
  return defaultMode === "tour" && !supportsTour ? "free" : defaultMode;
}
