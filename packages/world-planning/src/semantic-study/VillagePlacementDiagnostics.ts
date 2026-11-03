import type { PlanPoint } from "./IslandPlanModel";
import type { PoiSite } from "./PoiDistribution";
import { envelope } from "./IslandPlanAtoms";

export type VillageCandidateReason =
  | "unexamined"
  | "other-domain"
  | "coast-prefilter"
  | "occupied"
  | "actual-coast"
  | "collision"
  | "placed"
  | "preserve-site";
export interface VillageCandidateDiagnostic {
  siteId: string;
  center: PlanPoint;
  reason: VillageCandidateReason;
  coastClearanceM?: number;
  blockerIds: string[];
  probeOutline: PlanPoint[];
  actualOutline?: PlanPoint[];
}
/** Evidence for a finite search, independent of the accepted or rolled-back display plan. */
export interface VillagePlacementDiagnostics {
  requested: number;
  found: number;
  siteSpanM: number;
  candidates: VillageCandidateDiagnostic[];
}
export const VILLAGE_REASON_LABELS: Record<VillageCandidateReason, string> = {
  unexamined: "数量已满足，未继续尝试",
  "other-domain": "当前村庄策略仅使用主陆域",
  "coast-prefilter": "预筛包络越过海岸；保留为后备候选，尚未验证实际轮廓",
  occupied: "已有 POI 内容占用",
  "actual-coast": "实际建筑占地越过海岸",
  collision: "实际建筑与现有实体重叠",
  placed: "已放置村庄",
  "preserve-site": "保留既有村庄位置，未改用此点"
};
/** Initialize one record per large point, including coarse-probe fallbacks awaiting actual geometry. */
export function villagePlacementDiagnostics(
  sites: PoiSite[],
  requested: number,
  spanM: number
): VillagePlacementDiagnostics {
  return {
    requested,
    found: 0,
    siteSpanM: spanM,
    candidates: sites
      .filter((s) => s.tier === "large")
      .map((s) => ({
        siteId: s.id,
        center: { ...s.center },
        reason: "unexamined",
        blockerIds: [],
        probeOutline: envelope(s.center, spanM, spanM, 0)
      }))
  };
}
/** Render transaction evidence without implying that a failed draft was published. */
export function mountVillageDiagnostics(host: HTMLElement, focus: (candidate: VillageCandidateDiagnostic) => void) {
  return {
    update(report?: VillagePlacementDiagnostics) {
      host.replaceChildren();
      host.hidden = !report;
      if (!report) return;
      const details = document.createElement("details");
      details.className = "base-control-group";
      details.open = report.found < report.requested;
      const summary = document.createElement("summary");
      summary.textContent = `村庄选址诊断 · ${report.found}/${report.requested}`;
      details.append(summary);
      const note = document.createElement("p");
      note.className = "poi-explanation";
      note.textContent = `本次检查 ${report.candidates.length} 个大型点；${report.siteSpanM} × ${report.siteSpanM} m 预筛包络仅决定尝试顺序，实际建筑占地决定能否放置。未扫描点位之间的空地，结果不代表地图绝对容量。点击条目查看检查轮廓。`;
      details.append(note);
      for (const reason of Object.keys(VILLAGE_REASON_LABELS) as VillageCandidateReason[]) {
        const items = report.candidates.filter((c) => c.reason === reason);
        if (!items.length) continue;
        const group = document.createElement("details");
        const title = document.createElement("summary");
        title.textContent = `${VILLAGE_REASON_LABELS[reason]} · ${items.length}`;
        group.append(title);
        for (const c of items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "wp-diagnostic-item";
          button.textContent = `${c.siteId} · (${c.center.x.toFixed(0)}, ${c.center.z.toFixed(0)})${c.coastClearanceM !== undefined ? ` · 距海岸 ${c.coastClearanceM.toFixed(1)} m` : ""}${c.blockerIds.length ? (c.reason === "placed" ? " · 内容：" : " · 阻挡：") + c.blockerIds.join("、") : ""}`;
          button.onclick = () => focus(c);
          group.append(button);
        }
        details.append(group);
      }
      host.append(details);
    }
  };
}
