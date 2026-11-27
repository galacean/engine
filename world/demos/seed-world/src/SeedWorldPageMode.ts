/** Page-wide startup and presentation decisions for the Seed World demo. */
export interface SeedWorldPageMode {
  /** Selects the isolated runtime presentation or the opt-in debug authoring shell. */
  readonly kind: "runtime" | "debug";
  /** Initial roaming input owner for this presentation. */
  readonly defaultRoamInputMode: "joystick" | "keyboard";
  /** Whether startup should begin generating the 3D world without user input. */
  readonly directWorldOnLoad: boolean;
  /** Whether generated fields should be cloned for returning to the planning view. */
  readonly retainLayoutPreview: boolean;
  /** Whether diagnostic owners, panels, globals, and polling bridges may be created. */
  readonly debugFeaturesEnabled: boolean;
  /** Whether the opt-in rock acceptance workbench may mount inside the debug shell. */
  readonly rockWorkbenchEnabled: boolean;
  /** Whether the World Agent panel should open when the 3D runtime becomes ready. */
  readonly aiChatInitiallyOpen: boolean;
  /** Enables structured Agent/ASR tracing and the in-page trace inspector. */
  readonly agentTraceEnabled: boolean;
}

/**
 * Resolves the Seed World presentation boundary from the page query.
 *
 * @param query - Query parameters from the current page URL.
 * @returns One immutable mode contract shared by startup, rendering, diagnostics, and UI mounting.
 */
export function resolveSeedWorldPageMode(query: URLSearchParams): Readonly<SeedWorldPageMode> {
  const rockWorkbenchEnabled = query.get("rockLab") === "1";
  const debugFeaturesEnabled = query.get("debug") === "1" || rockWorkbenchEnabled;
  const cameraBookmarkRequested = (query.get("camera")?.trim().length ?? 0) > 0;
  return Object.freeze({
    kind: debugFeaturesEnabled ? "debug" : "runtime",
    defaultRoamInputMode: debugFeaturesEnabled ? "keyboard" : "joystick",
    directWorldOnLoad: !debugFeaturesEnabled || rockWorkbenchEnabled || cameraBookmarkRequested,
    retainLayoutPreview: debugFeaturesEnabled,
    debugFeaturesEnabled,
    rockWorkbenchEnabled,
    aiChatInitiallyOpen: debugFeaturesEnabled ? query.get("aiChat") === "1" : true,
    agentTraceEnabled: query.get("agentTrace") !== "0"
  });
}
