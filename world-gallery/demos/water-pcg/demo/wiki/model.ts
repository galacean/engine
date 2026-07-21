export type WaterWikiCategory = "开始" | "核心 API" | "运行时" | "接入" | "运维";

export interface WaterWikiPage {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: WaterWikiCategory;
  readonly keywords: readonly string[];
  readonly telemetry: readonly string[];
  readonly relatedCaseId?: string;
  readonly relatedCaseLabel?: string;
  readonly markdown: string;
}

export interface WaterWikiHeading {
  readonly depth: 2 | 3;
  readonly id: string;
  readonly label: string;
}
