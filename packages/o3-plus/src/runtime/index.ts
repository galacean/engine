export * from "./sceneLoader";
export * from "./interactive";

if (typeof window === "object" && window.window === window && !window.fetch) {
  throw new Error(`browser doesn't support fetch`);
}
