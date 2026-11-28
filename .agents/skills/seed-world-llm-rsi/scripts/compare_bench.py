#!/usr/bin/env python3
"""Compare Before vs After Seed World LLM benchmark summaries and static audits."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def agg_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(cases)
    passed = sum(1 for c in cases if c.get("taskCompleted"))
    first_hit = sum(1 for c in cases if c.get("skillRouting", {}).get("firstSkillHit"))
    turns = sum(int(c.get("llmTurns", 0)) for c in cases)
    opt = sum(int(c.get("optimalSteps", 0)) for c in cases)
    avg_ov = sum(float(c.get("overheadRatio", 0.0)) for c in cases) / n if n else 0.0
    dur_s = sum(float(c.get("totalDurationMs", 0.0)) for c in cases) / 1000.0
    tokens = sum(int(c.get("usageSummary", {}).get("totalTokens", 0)) for c in cases)
    grep_glob = sum(
        int(c.get("outerToolCallsByName", {}).get("grep", 0))
        + int(c.get("outerToolCallsByName", {}).get("glob", 0))
        for c in cases
    )
    explicit_limit = sum(len(c.get("declareCompliance", {}).get("explicitLimitOnDeclareReads", [])) for c in cases)
    dup_reads = sum(len(c.get("declareCompliance", {}).get("duplicateReadPaths", [])) for c in cases)
    repairs = sum(int(c.get("scriptQuality", {}).get("typecheckRepairCount", 0)) for c in cases)
    rt_errs = sum(int(c.get("scriptQuality", {}).get("runtimeErrorCount", 0)) for c in cases)
    hygiene_v = sum(len(c.get("compliance", {}).get("replyHygieneViolations", [])) for c in cases)
    scope_v = sum(len(c.get("compliance", {}).get("scopeViolations", [])) for c in cases)
    par_ratios = [float(c.get("compliance", {}).get("parallelReadRatio", 0.0)) for c in cases if "compliance" in c]
    avg_par = sum(par_ratios) / len(par_ratios) if par_ratios else 0.0
    return {
        "n": n,
        "passed": passed,
        "first_hit": first_hit,
        "turns": turns,
        "opt": opt,
        "avg_ov": avg_ov,
        "dur_s": dur_s,
        "tokens": tokens,
        "grep_glob": grep_glob,
        "explicit_limit": explicit_limit,
        "dup_reads": dup_reads,
        "repairs": repairs,
        "rt_errs": rt_errs,
        "hygiene_v": hygiene_v,
        "scope_v": scope_v,
        "avg_par": avg_par,
    }


def pct_delta(before: float, after: float) -> str:
    if before == 0:
        return "0%" if after == 0 else f"+{after:g}"
    delta = (after - before) / before * 100.0
    return f"{delta:+.1f}%"


def fmt_tokens(tok: int) -> str:
    if tok >= 1_000_000:
        return f"{tok / 1_000_000:.2f}M"
    if tok >= 1_000:
        return f"{tok / 1_000:.1f}K"
    return str(tok)


def render_static_diff(before: dict[str, Any], after: dict[str, Any]) -> str:
    def unreachable(d: dict[str, Any]) -> int:
        return sum(1 for m in d.get("skillMarkdowns", []) if m.get("hopDepth", -1) == -1)

    def engine_inlined(d: dict[str, Any]) -> tuple[int, int]:
        eng = d.get("engineDtsAudits", [])
        hit = sum(1 for item in eng if len(item.get("inlinedDeps", [])) > 0)
        return hit, len(eng)

    def skipped_deps(d: dict[str, Any]) -> int:
        return len(d.get("dtsWithSkippedDependencies", []))

    def total_initial_bytes(d: dict[str, Any]) -> int:
        ip = d.get("initialPayload", {})
        msgs = sum(int(m.get("bytes", 0)) for m in ip.get("messagesBreakdown", []))
        tools = int(ip.get("toolsTotalBytes", 0))
        return msgs + tools

    b_eh, b_et = engine_inlined(before)
    a_eh, a_et = engine_inlined(after)
    b_sys = total_initial_bytes(before)
    a_sys = total_initial_bytes(after)

    lines = [
        "### Static Audit Diff",
        "",
        "| 指标 | Before | After | 变化 |",
        "| --- | --- | --- | --- |",
        f"| 不可达 Skill/Ref 文档数 | {unreachable(before)} | {unreachable(after)} | {unreachable(after) - unreachable(before):+d} |",
        f"| `water.digRiver` 在 `API_INDEX` 可见 | {before.get('waterSkillAudit', {}).get('mentionsDigRiverInApiIndex')} | {after.get('waterSkillAudit', {}).get('mentionsDigRiverInApiIndex')} | - |",
        f"| `declare/engine/` 抽样内联命中 | {b_eh}/{b_et} | {a_eh}/{a_et} | {a_eh - b_eh:+d} |",
        f"| 含跳过依赖的 `.d.ts` 数 | {skipped_deps(before)} | {skipped_deps(after)} | {skipped_deps(after) - skipped_deps(before):+d} |",
        f"| 首屏初始上下文总字节 | {b_sys} B | {a_sys} B | {pct_delta(b_sys, a_sys)} |",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare Before vs After LLM benchmark summaries")
    parser.add_argument("--before", required=True, help="Baseline summary JSON")
    parser.add_argument("--after", required=True, help="Candidate summary JSON")
    parser.add_argument("--audit-before", help="Optional baseline static-audit JSON")
    parser.add_argument("--audit-after", help="Optional candidate static-audit JSON")
    parser.add_argument("--exclude", default="", help="Comma-separated case ID prefixes to exclude from comparison")
    args = parser.parse_args()

    if args.audit_before and args.audit_after:
        print(render_static_diff(load_json(args.audit_before), load_json(args.audit_after)))

    b_data = load_json(args.before)
    a_data = load_json(args.after)

    excludes = [x.strip() for x in args.exclude.split(",") if x.strip()]
    b_map = {c["caseId"]: c for c in b_data.get("cases", [])}
    a_map = {c["caseId"]: c for c in a_data.get("cases", [])}
    common_ids = [
        cid for cid in a_map
        if cid in b_map and not any(cid == ex or cid.startswith(ex) for ex in excludes)
    ]

    if not common_ids:
        print("No overlapping caseIds between --before and --after.", file=sys.stderr)
        return 1

    b_agg = agg_cases([b_map[cid] for cid in common_ids])
    a_agg = agg_cases([a_map[cid] for cid in common_ids])

    print(f"### Dynamic Benchmark A/B ({len(common_ids)} overlapping cases)")
    print()
    print("| 核心指标 | Before | After | 变化幅度 |")
    print("| --- | --- | --- | --- |")
    print(f"| 任务通过率 | {b_agg['passed']}/{b_agg['n']} | {a_agg['passed']}/{a_agg['n']} | {a_agg['passed'] - b_agg['passed']:+d} |")
    print(f"| 一级 Skill 首跳命中 | {b_agg['first_hit']}/{b_agg['n']} | {a_agg['first_hit']}/{a_agg['n']} | {a_agg['first_hit'] - b_agg['first_hit']:+d} |")
    print(f"| 总 LLM 轮次 | {b_agg['turns']} | {a_agg['turns']} | {pct_delta(b_agg['turns'], a_agg['turns'])} |")
    print(f"| 平均步数膨胀比 (`overheadRatio`) | {b_agg['avg_ov']:.2f}x | {a_agg['avg_ov']:.2f}x | {pct_delta(b_agg['avg_ov'], a_agg['avg_ov'])} |")
    print(f"| 总耗时（串行） | {b_agg['dur_s']:.1f}s | {a_agg['dur_s']:.1f}s | {pct_delta(b_agg['dur_s'], a_agg['dur_s'])} |")
    print(f"| 总 Token 消耗 | {fmt_tokens(b_agg['tokens'])} | {fmt_tokens(a_agg['tokens'])} | {pct_delta(b_agg['tokens'], a_agg['tokens'])} |")
    print(f"| `grep/glob` 探索次数 | {b_agg['grep_glob']} | {a_agg['grep_glob']} | {pct_delta(b_agg['grep_glob'], a_agg['grep_glob'])} |")
    print(f"| `.d.ts` 显式 `limit` 截断次数 | {b_agg['explicit_limit']} | {a_agg['explicit_limit']} | {pct_delta(b_agg['explicit_limit'], a_agg['explicit_limit'])} |")
    print(f"| 重复读同一文件次数 | {b_agg['dup_reads']} | {a_agg['dup_reads']} | {pct_delta(b_agg['dup_reads'], a_agg['dup_reads'])} |")
    print(f"| TS 类型检查返工次数 | {b_agg['repairs']} | {a_agg['repairs']} | {pct_delta(b_agg['repairs'], a_agg['repairs'])} |")
    print(f"| 脚本运行期报错次数 | {b_agg['rt_errs']} | {a_agg['rt_errs']} | {pct_delta(b_agg['rt_errs'], a_agg['rt_errs'])} |")
    print(f"| 回复合规违规次数 | {b_agg['hygiene_v']} | {a_agg['hygiene_v']} | {a_agg['hygiene_v'] - b_agg['hygiene_v']:+d} |")
    print(f"| 范围越界/误伤次数 | {b_agg['scope_v']} | {a_agg['scope_v']} | {a_agg['scope_v'] - b_agg['scope_v']:+d} |")
    print(f"| 平均并行读取占比 | {b_agg['avg_par']:.2f} | {a_agg['avg_par']:.2f} | {a_agg['avg_par'] - b_agg['avg_par']:+.2f} |")
    print()

    print("### Per-Case Breakdown")
    print()
    print("| Case | Before (pass / turns / ratio / tok) | After (pass / turns / ratio / tok) | Turns Δ | Tokens Δ |")
    print("| --- | --- | --- | --- | --- |")
    for cid in common_ids:
        bc = b_map[cid]
        ac = a_map[cid]
        bt = int(bc["llmTurns"])
        at = int(ac["llmTurns"])
        btok = int(bc["usageSummary"]["totalTokens"])
        atok = int(ac["usageSummary"]["totalTokens"])
        bstr = f"{'PASS' if bc['taskCompleted'] else 'FAIL'} / {bt}/{bc['optimalSteps']} ({bc['overheadRatio']:.2f}x) / {fmt_tokens(btok)}"
        astr = f"{'PASS' if ac['taskCompleted'] else 'FAIL'} / {at}/{ac['optimalSteps']} ({ac['overheadRatio']:.2f}x) / {fmt_tokens(atok)}"
        print(f"| `{cid}` | {bstr} | {astr} | {pct_delta(bt, at)} | {pct_delta(btok, atok)} |")

    return 0


if __name__ == "__main__":
    sys.exit(main())
