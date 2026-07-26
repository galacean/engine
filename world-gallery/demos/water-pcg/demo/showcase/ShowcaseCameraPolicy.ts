export type ShowcaseCameraMode = "free" | "fixed" | "tour";
export type ShowcaseCameraScene = "river" | "pool" | "ocean" | "grasslands";

export const SHOWCASE_CAMERA_MOVEMENT_SPEED = Object.freeze({
  river: 16,
  pool: 8,
  ocean: 28,
  grasslands: 14
} satisfies Readonly<Record<ShowcaseCameraScene, number>>);

const AUTOMATED_CAMERA_PARAMETERS = Object.freeze(["acceptance", "visual", "profile"] as const);

export function isShowcaseAutomation(search: Pick<URLSearchParams, "get">): boolean {
  return AUTOMATED_CAMERA_PARAMETERS.some((parameter) => search.get(parameter) === "1");
}

/**
 * Automation keeps authored camera poses deterministic. Public Showcase routes
 * default to free roaming; the legacy auto tour is now explicit.
 */
export function resolveShowcaseCameraMode(
  search: Pick<URLSearchParams, "get">,
  supportsTour = false
): ShowcaseCameraMode {
  if (isShowcaseAutomation(search)) return "fixed";
  if (supportsTour && search.get("tour") === "1") return "tour";
  return "free";
}
