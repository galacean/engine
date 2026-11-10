import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";

let selection: { id: string; seed: number } | undefined;

/** Remember an explicit launch selection for this page lifetime only.
 * @param id Registered theme, or empty for the original world.
 * @param seed Selected world identity.
 */
export function selectPlanningStartupTemplate(id: string, seed: number): void {
  selection = { id, seed };
}

/** Resolve new authoring without replacing a saved world's later edits on refresh.
 * @param search Current page query, carrying the initial template for a new world.
 * @param seed World identity being opened.
 * @param savedTemplate Saved template identity, empty for the original world, undefined if absent.
 * @returns Template to initialize, or undefined to restore the saved document.
 */
export function initialPlanningTemplate(search: string, seed: number, savedTemplate?: string): string | undefined {
  const explicit = selection?.seed === seed ? selection.id : undefined;
  if (savedTemplate !== undefined) return explicit !== undefined && explicit !== savedTemplate ? explicit : undefined;
  const id = explicit ?? new URLSearchParams(search).get("template");
  if (id === "original" || !id) return "";
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  return id;
}
