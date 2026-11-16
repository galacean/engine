// Render report.cjs output. findings.json is an optional, evidence-reviewed narrative.
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
if (!root) throw Error("Pass audit evidence root");
const report = JSON.parse(fs.readFileSync(path.join(root, "coverage.json"), "utf8"));
const findingsPath = path.join(root, "findings.json");
const findings = fs.existsSync(findingsPath) ? JSON.parse(fs.readFileSync(findingsPath, "utf8")) : [];
const escape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const number = (value) => (value == null ? "—" : value.toFixed(1));
const evidence = (files) => files.map((file) => `<a href="${escape(file)}">${escape(file)}</a>`).join(" · ");
const rows = report.interfaces
  .map(
    (item) =>
      `<tr><td>${escape(item.scope)}</td><td><code>${escape(item.name)}</code><br><small>${escape(item.status)}</small></td><td>${item.successfulCases}</td><td>${item.wallRangeMs?.map(number).join("–") ?? "—"}</td><td>${number(item.maxPrimaryRoundtripMs)}</td><td>${number(item.maxLongTaskMs)}</td><td>${number(item.maxEngineGapMs)}</td><td>${escape(item.diagnosis)}<details><summary>原始证据</summary>${evidence(item.evidence)}</details></td></tr>`
  )
  .join("");
const failedBranches = report.branches.filter((branch) => !branch.success);
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Seed World 接口性能审计</title>
<style>body{font:15px/1.65 system-ui;margin:32px;color:#182536;background:#f6f8fb}main{max-width:1600px;margin:auto}h1{font-size:28px}section{background:white;padding:20px 24px;margin:18px 0;border:1px solid #dae1eb;border-radius:10px}p{max-width:1050px}a{color:#2059b7}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e1e7f0;padding:10px}th{position:sticky;top:0;background:#eaf0f9}code{overflow-wrap:anywhere}small{color:#63738a}input{padding:10px;width: min(600px,90%);margin:8px 0}details{max-width:460px;overflow-wrap:anywhere}.scroll{overflow:auto}</style>
<main><h1>真实 Seed World：Worker 与公共工具性能审计</h1><p>原始模板，seed=1，1280×800，本地开发版 Chrome。直接调用真实 Worker 与生产校验、事务和发布链；公共工具走真实 AgentLoop，只替换模型派发，不调用 LLM。所有测试使用隔离浏览器上下文。</p>
<section><b>${report.toolCount} 个接口：${report.tools.filter((x) => x.scope === "worker").length} 个 Worker 接口 + ${report.tools.filter((x) => x.scope === "public").length} 个公共工具。</b><p>${report.successfulTools} 个接口至少有一次运行成功记录。</p><p>额外操作分支：${report.branches.length - failedBranches.length}/${report.branches.length} 成功。${failedBranches.length ? "未成功分支：" + escape(failedBranches.map((x) => x.id).join(", ")) + "。拒绝、提交后激活报错和失败的前置条件均不计成功。" : ""}</p><a href="interfaces.csv">逐接口 CSV</a> · <a href="coverage.json">完整测量 JSON</a></section>
${findings.map((finding) => `<section><h2>${escape(finding.title)}</h2><p>${escape(finding.conclusion)}</p><p>优化方向：${escape(finding.next)}</p><details><summary>证据与代码位置</summary><p>${evidence(finding.evidence)}</p><p>${escape((finding.source ?? []).join("；"))}</p></details></section>`).join("")}
<section><h2>逐接口记录</h2><p>单位均为 ms。整段耗时包含前置调用、异步等待、提交与激活；主接口往返只含指定接口，但也可能包含动作等待。长任务和帧间隔覆盖操作及之后1.5秒，可能包含场景自身工作；只有定向证据支持的部分才作根因归属。最大值不等于典型值。</p><input id="filter" placeholder="搜索接口、系统或结论" aria-label="搜索接口"><div class="scroll"><table><thead><tr><th>范围</th><th>接口</th><th>成功用例数</th><th>整段耗时范围</th><th>主接口最大往返</th><th>最大主线程长任务</th><th>最大引擎帧间隔</th><th>分析</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>测量边界</h2><ul>${report.limitations.map((line) => `<li>${escape(line)}</li>`).join("")}</ul></section></main>
<script>document.querySelector('#filter').addEventListener('input',function(){const q=this.value.toLowerCase();for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(q)});</script></html>`;
fs.writeFileSync(path.join(root, "audit.html"), html);
console.log(path.join(root, "audit.html"));
