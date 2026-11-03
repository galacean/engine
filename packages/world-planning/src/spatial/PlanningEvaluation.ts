import { PlanningSession, type EditReceipt, type PlanningParameterCommand } from "./PlanningSession";
import type { PlanningDocument } from "./PlanningDocument";
import type { SpatialCommand } from "./SpatialDocument";
export interface QueryCase {
  id: string;
  query: string;
}
export interface QueryEvidence {
  id: string;
  query: string;
  attempt: number;
  commands: SpatialCommand[];
  receipt: EditReceipt;
  before: PlanningDocument;
  after: PlanningDocument;
  screenshot?: string;
  assessment?: { status: "pass" | "fail" | "unreviewed"; notes: string };
  error?: string;
}
export interface QueryTranslator {
  /** The provider may discover fields and query/inspect entities; it must return registered parameter commands. */
  translate(
    query: string,
    tools: Pick<PlanningSession, "describe" | "query" | "inspect">,
    previous?: QueryEvidence
  ): Promise<PlanningParameterCommand[]>;
}
/** Provider-independent evaluation. Actual model calls and screenshot capture are supplied explicitly.
 * No template commands or hidden retries are presented as LLM understanding.
 */
export async function evaluatePlanningQueries(
  session: PlanningSession,
  cases: QueryCase[],
  translator: QueryTranslator,
  options: {
    maxAttempts?: number;
    capture?: (evidence: QueryEvidence) => Promise<string>;
    record?: (evidence: QueryEvidence) => Promise<void>;
    assess?: (evidence: QueryEvidence) => Promise<NonNullable<QueryEvidence["assessment"]>>;
  } = {}
): Promise<QueryEvidence[]> {
  const results: QueryEvidence[] = [];
  const maxAttempts = options.maxAttempts ?? 1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error("评测尝试预算须为1–3");
  const tools = {
    describe: () => session.describe(),
    query: session.query.bind(session),
    inspect: session.inspect.bind(session)
  };
  for (const test of cases) {
    let previous: QueryEvidence | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const before = session.export();
      let commands: PlanningParameterCommand[] = [],
        receipt: EditReceipt,
        error: string | undefined;
      try {
        commands = await translator.translate(test.query, tools, previous);
        receipt = await session.dispatchParameters(commands, before.revision);
      } catch (e) {
        error = String(e);
        receipt = {
          status: "rejected",
          revision: session.document.revision,
          changedIds: [],
          diagnostics: [],
          message: error
        };
      }
      const evidence: QueryEvidence = { ...test, attempt, commands, receipt, before, after: session.export(), error };
      if (options.capture)
        try {
          evidence.screenshot = await options.capture(evidence);
        } catch (e) {
          evidence.error = "截图失败：" + String(e);
        }
      evidence.assessment = { status: "unreviewed", notes: "命令和约束结果不代表用户意图已满足" };
      if (options.assess)
        try {
          evidence.assessment = await options.assess(evidence);
        } catch (error) {
          evidence.error = [evidence.error, "意图评估失败：" + String(error)].filter(Boolean).join("；");
        }
      await options.record?.(evidence);
      results.push(evidence);
      previous = evidence;
      if (receipt.status === "accepted" && evidence.assessment.status !== "fail") break;
    }
  }
  return results;
}
