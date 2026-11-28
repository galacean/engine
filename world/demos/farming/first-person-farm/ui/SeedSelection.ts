import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/index";

const STORAGE_KEY = "galacean-farming-selected-seed-v1";

/** Browsing a seed never changes the equipped seed until the player confirms. */
export class SeedSelection {
  selectedId: string | null = null;
  candidateId: string;

  constructor(
    private readonly definitions: FarmingDefinitionSet,
    private readonly storage?: Pick<Storage, "getItem" | "setItem">
  ) {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (saved && this.isValid(saved)) this.selectedId = saved;
    } catch {
      /* Selection still works when browser storage is unavailable. */
    }
    this.candidateId = this.selectedId ?? definitions.seeds[0].id;
  }

  begin(): void {
    this.candidateId = this.selectedId ?? this.definitions.seeds[0].id;
  }

  /** Launch input is a one-time command, not a persistent selection override.
   * The caller replaces the current history entry with the consumed URL.
   */
  consumeSeedRequest(url: URL): boolean {
    if (!url.searchParams.has("seed")) return false;
    const cropId = url.searchParams.get("seed");
    url.searchParams.delete("seed");
    const seed = this.definitions.seeds.find((item) => item.cropId === cropId);
    if (seed && this.preview(seed.id)) this.confirm();
    return true;
  }

  preview(id: string): boolean {
    if (!this.isValid(id)) return false;
    this.candidateId = id;
    return true;
  }

  confirm(): string {
    this.selectedId = this.candidateId;
    try {
      this.storage?.setItem(STORAGE_KEY, this.selectedId);
    } catch {
      /* Keep the session selection. */
    }
    return this.selectedId;
  }

  private isValid(id: string): boolean {
    return this.definitions.seeds.some((seed) => seed.id === id);
  }
}

export function formatSeedDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours) return `${hours}小时${minutes ? `${minutes}分` : ""}${remainder ? `${remainder}秒` : ""}`;
  if (minutes) return remainder ? `${minutes}分${remainder}秒` : `${minutes}分钟`;
  return `${remainder}秒`;
}
