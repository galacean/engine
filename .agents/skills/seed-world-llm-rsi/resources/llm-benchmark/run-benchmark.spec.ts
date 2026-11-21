import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createHeadlessSeedWorldFixture, type TurnExecutionRecord } from "./seed-world-headless-fixture.ts";
import { BENCHMARK_CASES, extractCaseTelemetry, type CaseMetrics } from "./benchmark-cases.ts";

const DEFAULT_OUT_DIR = path.join(os.tmpdir(), "seed-world-llm-bench", "traces");
const DEFAULT_SUMMARY_PATH = path.join(os.tmpdir(), "seed-world-llm-bench", "summary.json");
const EXPECTED_MODEL = process.env.BENCH_EXPECTED_MODEL?.trim() || "DeepSeek-V4.1-Flash";

function selectCases() {
  const filterRaw = process.env.BENCH_CASES?.trim();
  if (!filterRaw) return BENCHMARK_CASES;
  const tokens = filterRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return BENCHMARK_CASES.filter((c) => tokens.some((tok) => c.id === tok || c.id.startsWith(tok)));
}

const TRANSIENT_TRANSPORT_ERROR_RE =
  /AI chat request deadline exceeded|ASAP AI 通道超时|APIConnectionError|APITimeoutError|ConnectTimeout|Connection error|STREAM_INCOMPLETE/i;

function shouldRetryCaseAttempt(fatalSetupError: string | undefined, turnRecords: readonly TurnExecutionRecord[]): boolean {
  if (EXPECTED_MODEL !== "*" && turnRecords.some((t) => t.modelsSeen.some((m) => m !== EXPECTED_MODEL))) {
    return false;
  }
  if (fatalSetupError && TRANSIENT_TRANSPORT_ERROR_RE.test(fatalSetupError)) {
    return true;
  }
  if (turnRecords.some((t) => t.error && TRANSIENT_TRANSPORT_ERROR_RE.test(t.error))) {
    return true;
  }
  if (turnRecords.some((t) => t.modelsSeen.length === 0)) {
    return true;
  }
  return false;
}

function summarizeResults(results: readonly CaseMetrics[]) {
  const passed = results.filter((r) => r.taskCompleted).length;
  const firstPassScripts = results.filter((r) => r.scriptQuality.executeCount > 0 && r.scriptQuality.firstPassSuccess).length;
  const withScripts = results.filter((r) => r.scriptQuality.executeCount > 0).length;
  const firstSkillHits = results.filter((r) => r.skillRouting.firstSkillHit).length;
  const totalDupReads = results.reduce((s, r) => s + r.declareCompliance.duplicateReadPaths.length, 0);
  const totalDupInlinedReads = results.reduce((s, r) => s + r.declareCompliance.duplicateInlinedReads.length, 0);
  const totalExplicitLimitReads = results.reduce((s, r) => s + r.declareCompliance.explicitLimitOnDeclareReads.length, 0);
  const totalTypecheckRepairs = results.reduce((s, r) => s + r.scriptQuality.typecheckRepairCount, 0);
  const totalRuntimeErrors = results.reduce((s, r) => s + r.scriptQuality.runtimeErrorCount, 0);
  const totalReplyHygieneViolations = results.reduce((s, r) => s + (r.compliance?.replyHygieneViolations.length ?? 0), 0);
  const totalScopeViolations = results.reduce((s, r) => s + (r.compliance?.scopeViolations.length ?? 0), 0);
  const avgParallelReadRatio = results.length
    ? Number((results.reduce((s, r) => s + (r.compliance?.parallelReadRatio ?? 0), 0) / results.length).toFixed(2))
    : 0;
  const totalDurationMs = results.reduce((s, r) => s + r.totalDurationMs, 0);
  const overheadRatios = results.map((r) => r.overheadRatio);
  const avgOverheadRatio = overheadRatios.length
    ? Number((overheadRatios.reduce((a, b) => a + b, 0) / overheadRatios.length).toFixed(2))
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases: passed,
    passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0,
    firstSkillHitRate: results.length ? Number((firstSkillHits / results.length).toFixed(4)) : 0,
    firstPassScriptRate: withScripts ? Number((firstPassScripts / withScripts).toFixed(4)) : 1,
    totalDuplicateReads: totalDupReads,
    totalDuplicateInlinedReads: totalDupInlinedReads,
    totalExplicitLimitDeclareReads: totalExplicitLimitReads,
    totalTypecheckRepairs,
    totalRuntimeErrors,
    totalReplyHygieneViolations,
    totalScopeViolations,
    avgParallelReadRatio,
    avgOverheadRatio,
    totalDurationMs: Number(totalDurationMs.toFixed(1)),
    cases: results
  };
}

it(
  "runs Seed World headless LLM benchmark serially against local ASAP 8082",
  async () => {
    const outDir = process.env.BENCH_OUT_DIR || DEFAULT_OUT_DIR;
    const summaryPath = process.env.BENCH_SUMMARY_PATH || DEFAULT_SUMMARY_PATH;
    const skipExisting = process.env.BENCH_SKIP_EXISTING === "1";
    const cooldownMs = Number(process.env.BENCH_COOLDOWN_MS ?? "1500");

    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });

    const cases = selectCases();
    expect(cases.length).toBeGreaterThan(0);

    const allMetrics: CaseMetrics[] = [];

    for (let index = 0; index < cases.length; index++) {
      const def = cases[index]!;
      const tracePath = path.join(outDir, `${def.id}.json`);

      if (skipExisting && fs.existsSync(tracePath)) {
        const cached = JSON.parse(fs.readFileSync(tracePath, "utf8")) as { metrics?: CaseMetrics };
        if (cached.metrics) {
          console.log(`[bench] skipping existing ${def.id} (completed=${cached.metrics.taskCompleted})`);
          allMetrics.push(cached.metrics);
          continue;
        }
      }

      console.log(`[bench] (${index + 1}/${cases.length}) starting ${def.id}: ${def.name}`);
      type VerifyChecks = ReturnType<typeof def.verify> extends Promise<infer R> ? R : ReturnType<typeof def.verify>;
      let turnRecords: TurnExecutionRecord[] = [];
      let checks: VerifyChecks = [];
      let fatalSetupError: string | undefined;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const fixture = await createHeadlessSeedWorldFixture({ caseId: def.id });
        turnRecords = [];
        fatalSetupError = undefined;
        checks = [];

        try {
          if (def.setup) {
            await def.setup(fixture);
          }
          for (let t = 0; t < def.turns.length; t++) {
            const inputSource = def.turnInputSources?.[t] ?? "text";
            const rec = await fixture.runTurn(def.turns[t]!, t, { inputSource });
            turnRecords.push(rec);
            if (EXPECTED_MODEL !== "*") {
              for (const modelName of rec.modelsSeen) {
                expect(modelName, `Unexpected model route in ${def.id}`).toBe(EXPECTED_MODEL);
              }
            }
          }
        } catch (err) {
          fatalSetupError = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        }

        try {
          checks = await def.verify(fixture, turnRecords);
        } catch (err) {
          checks = [
            {
              name: "verify_exception",
              pass: false,
              detail: err instanceof Error ? err.message : String(err)
            }
          ];
        } finally {
          await fixture.dispose();
        }

        if (attempt === 1 && shouldRetryCaseAttempt(fatalSetupError, turnRecords)) {
          console.log(`[bench] transient transport failure in ${def.id} (attempt 1/2); retrying after 10s...`);
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        break;
      }

      for (let t = 0; t < turnRecords.length; t++) {
        if (turnRecords[t]!.modelsSeen.length === 0) {
          const msg = `No modelName captured for ${def.id} turn ${t}`;
          fatalSetupError = fatalSetupError ? `${fatalSetupError}\n${msg}` : msg;
        }
      }

      if (fatalSetupError) {
        checks.unshift({ name: "setup_or_turn_execution", pass: false, detail: fatalSetupError });
      }

      const metrics = extractCaseTelemetry(def, turnRecords, checks);
      allMetrics.push(metrics);

      fs.writeFileSync(
        tracePath,
        JSON.stringify(
          {
            caseId: def.id,
            name: def.name,
            category: def.category,
            metrics,
            turns: turnRecords
          },
          null,
          2
        )
      );

      console.log(
        `[bench] finished ${def.id}: pass=${metrics.taskCompleted}, llmTurns=${metrics.llmTurns}/${metrics.optimalSteps}, dupReads=${metrics.declareCompliance.duplicateReadPaths.length}, repairs=${metrics.scriptQuality.typecheckRepairCount}, ms=${metrics.totalDurationMs}, flags=[${metrics.detourFlags.join(",")}]`
      );

      if (index < cases.length - 1 && cooldownMs > 0) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    }

    // When BENCH_CASES ran a subset, merge with existing traces in outDir if summarizing full suite
    const summaryMetrics =
      process.env.BENCH_CASES?.trim()
        ? allMetrics
        : BENCHMARK_CASES.map((def) => {
            const existing = allMetrics.find((m) => m.caseId === def.id);
            if (existing) return existing;
            const tracePath = path.join(outDir, `${def.id}.json`);
            if (fs.existsSync(tracePath)) {
              return (JSON.parse(fs.readFileSync(tracePath, "utf8")) as { metrics: CaseMetrics }).metrics;
            }
            return undefined;
          }).filter((m): m is CaseMetrics => Boolean(m));

    const summary = summarizeResults(summaryMetrics);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(
      `[bench] summary written to ${summaryPath}: ${summary.passedCases}/${summary.totalCases} passed, firstSkillHitRate=${summary.firstSkillHitRate}, avgOverhead=${summary.avgOverheadRatio}`
    );

    // Every case must have verified routing to DeepSeek-V4.1-Flash
    for (const m of allMetrics) {
      expect(m.modelVerified, `${m.caseId} modelVerified`).toBe(true);
    }
  },
  3_600_000
);
