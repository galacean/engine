import { spatialRecordEditor } from "@galacean/engine-world-planning/spatial/SpatialRecordEditor";
import { formatSpatialFieldValue } from "./SpatialFieldValue.ts";
import type { PlanningSession, EditReceipt } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { planningRegistry, PLANNING_COMPONENTS } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import type { SpatialCommand } from "@galacean/engine-world-planning/spatial/SpatialDocument";
type InspectorTab = "world" | "ecology" | "roads" | "lighting" | "wayfinding";
/** Resolve the selected entity only. Parameter bases supply values, never additional edit targets. */
export function inspectSpatialSelection(session: PlanningSession, id: string, tab?: InspectorTab) {
  const own = session.inspect(id);
  // Containment is not an edit target: inherited values resolve on this entity.
  const groups = own.components
    .filter((c) => {
      const definition = PLANNING_COMPONENTS.find((d) => d.type === c.type);
      return !definition?.legacy && definition?.inspector !== false;
    })
    .filter(
      (c) =>
        !tab ||
        (tab === "world"
          ? ["world", "ecology", "roads"].includes(PLANNING_COMPONENTS.find((d) => d.type === c.type)?.tab ?? "")
          : PLANNING_COMPONENTS.find((d) => d.type === c.type)?.tab === tab)
    )
    .map((c) => ({
      item: own,
      c,
      definition: {
        ...planningRegistry.get(c.type),
        fields: planningRegistry
          .get(c.type)
          .fields.filter((field) => {
            const binding = PLANNING_COMPONENTS.find((d) => d.type === c.type)?.global;
            return own.id !== "world" || !binding || !!binding[field.key] || !!field.readonly;
          })
          .filter(
            (f) =>
              (!f.visibleWhen ||
                [f.visibleWhen, ...(f.visibleWhen.and ?? [])].every((condition) =>
                  condition.values.includes(c.values[condition.field])
                )) &&
              (!f.hiddenWhen ||
                ![f.hiddenWhen, ...(f.hiddenWhen.and ?? [])].every((condition) =>
                  condition.values.includes(c.values[condition.field])
                ))
          )
      }
    }))
    .sort(
      (a, b) =>
        (PLANNING_COMPONENTS.find((d) => d.type === a.c.type)?.inspectorOrder ?? 100) -
        (PLANNING_COMPONENTS.find((d) => d.type === b.c.type)?.inspectorOrder ?? 100)
    );
  return { own, groups };
}
/** Schema-driven editor. No village, canyon or landscape algorithms belong in this view. */
export function mountSpatialInspector(
  host: HTMLElement,
  session: PlanningSession,
  commit: (commands: SpatialCommand[]) => Promise<EditReceipt>
) {
  const recordEditors = new Map<string, ReturnType<typeof spatialRecordEditor>>();
  let structure = "";
  const inputs = new Map<
    string,
    {
      input: HTMLInputElement | HTMLSelectElement;
      output: HTMLOutputElement;
      reset?: HTMLButtonElement;
      entity: string;
      component: string;
      field: string;
    }
  >();
  const expanded = new Map<string, boolean>();
  const drafts = new Set<string>();
  return {
    update(id: string | null, tab?: InspectorTab) {
      if (!id) {
        host.textContent = "在地图或 Hierarchy 中选择对象";
        structure = "";
        return;
      }
      const { own, groups } = inspectSpatialSelection(session, id, tab);
      const key = JSON.stringify([
        id,
        own.name,
        tab,
        groups.map((g) => [g.item.id, g.c.type, g.definition.fields.map((f) => f.key)])
      ]);
      if (key !== structure) {
        recordEditors.clear();
        for (const d of host.querySelectorAll<HTMLDetailsElement>("details[data-component]"))
          expanded.set(d.dataset.component!, d.open);
        structure = key;
        host.replaceChildren();
        inputs.clear();
        const waterKind=session.scene?.entities.get(id)?.kind;
        if(waterKind==="water"||waterKind==="lake"){
          const remove=document.createElement("button");remove.type="button";remove.textContent="删除水体";
          remove.onclick=async()=>{remove.disabled=true;try{await commit(session.document.entities[id]?.origin==="authored"?[{op:"remove",entity:id}]:[{op:"set",entity:id,component:waterKind==="lake"?"lakes":"rivers",values:{enabled:false}}]);}finally{remove.disabled=false;}};
          host.append(remove);
        }
        drafts.clear();
        if (!tab) {
          const name = document.createElement("h2");
          name.textContent = own.name;
          host.append(name);
        }
        const categories = new Map<string, HTMLDetailsElement>();
        for (const { item, c, definition } of groups) {
          const group = document.createElement("details"),
            groupId = item.id + ":" + c.type;
          group.className = "base-control-group";
          group.dataset.component = groupId;
          group.open = expanded.get(groupId) ?? item.id === id;
          const summary = document.createElement("summary");
          const presentation = PLANNING_COMPONENTS.find(d => d.type === c.type)?.scopePresentation?.[item.id];
          summary.textContent = presentation?.label ?? ((item.id === id ? "" : item.name + " · ") + definition.label);
          group.append(summary);
          const rangeRows = new Map<string, HTMLFieldSetElement>();
          if (presentation?.description) {
            const help = document.createElement("p");
            help.textContent = presentation.description;
            help.className = "ip-parameter-help";
            group.append(help);
          }
          for (const field of definition.fields) {
            if (field.hidden || (item.id !== "world" && field.kinds && !field.kinds.includes(item.kind ?? "")))
              continue;
            const row = document.createElement("label");
            row.className = "ip-parameter";
            if (field.type === "records") {
              const editor = spatialRecordEditor(field, value => commit([{ op: "set", entity: item.id, component: c.type, values: { [field.key]: value } }]));
              const title = document.createElement("summary"); title.textContent = field.label;
              const panel = document.createElement("details"); panel.append(title, editor.element); group.append(panel);
              recordEditors.set(groupId + ":" + field.key, editor);
              continue;
            }
            const label = document.createElement("span"),
              output = document.createElement("output");
            label.textContent = field.label;
            label.append(output);
            row.append(label);
            const input = field.options ? document.createElement("select") : document.createElement("input");
            input.disabled = !!field.readonly;
            input.hidden = !!field.readonly;
            input.setAttribute("aria-label", field.label);
            input.dataset.entity = item.id;
            input.dataset.component = c.type;
            input.dataset.field = field.key;
            if (input instanceof HTMLSelectElement)
              for (const value of field.options!) {
                const o = document.createElement("option");
                o.value = value;
                o.textContent = field.optionLabels?.[value] ?? value;
                input.append(o);
              }
            else {
              input.type = field.type === "boolean" ? "checkbox" : field.type === "number" ? "number" : "text";
              input.step = input.type === "number" && !field.integer ? "any" : String(field.step ?? 1);
            }
            const pair = definition.ranges?.find((keys) => keys.includes(field.key));
            const rangeKey = pair && groupId + ":" + pair[0];
            let pendingValue: string | undefined;
            const submit = () => {
              if (field.type === "number" && input.value.trim() === "") return;
              if (field.type === "number" && !Number.isFinite(Number(input.value))) return;
              const value =
                field.type === "number"
                  ? Number(input.value) / (field.unit === "%" ? 100 : 1)
                  : field.type === "boolean"
                    ? (input as HTMLInputElement).checked
                    : input.value;
              const values: Record<string, unknown> = { [field.key]: value };
              if (pair) {
                const editors = pair.map((key) => inputs.get(groupId + ":" + key)!);
                const fields = pair.map((key) => definition.fields.find((f) => f.key === key)!);
                const raw = editors.map((ui) => ui.input.value.trim());
                const numbers = raw.map((v, i) => Number(v) / (fields[i].unit === "%" ? 100 : 1));
                const valid = raw.every((v) => v !== "") && numbers.every(Number.isFinite) && numbers[0] <= numbers[1];
                const message = valid ? "" : "区间尚未生效：请填写下限 ≤ 上限，然后按 Enter 或离开输入框。";
                const note = rangeRows.get(rangeKey!)!.querySelector("small")!;
                note.textContent = message;
                for (const ui of editors) ui.input.setAttribute("aria-invalid", String(!valid));
                if (!valid) {
                  drafts.add(rangeKey!);
                  return;
                }
                pair.forEach((key, i) => {
                  values[key] = numbers[i];
                });
                drafts.delete(rangeKey!);
              }
              const submittedValue = JSON.stringify(values);
              if (pendingValue === submittedValue) return;
              pendingValue = submittedValue;
              output.textContent = formatSpatialFieldValue(field, value);
              void commit([{ op: "set", entity: item.id, component: c.type, values }]).finally(() => {
                if (pendingValue === submittedValue) pendingValue = undefined;
              });
            };
            if (input instanceof HTMLInputElement && input.type === "number") {
              input.oninput = () => {
                if (rangeKey) drafts.add(rangeKey);
              };
              input.onchange = submit;
              input.onkeydown = (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                  input.blur();
                }
              };
            } else input.oninput = submit;
            row.append(input);
            const reset = field.readonly ? undefined : document.createElement("button");
            if (reset) {
              reset.type = "button";
              reset.textContent = "恢复默认";
              reset.setAttribute("aria-label", `${field.label} · 恢复默认`);
              reset.onclick = async event => {
                event.preventDefault();
                reset.disabled = true;
                try {
                  await commit([{ op: "reset", entity: item.id, component: c.type, fields: [field.key] }]);
                } finally { reset.disabled = false; }
              };
              row.append(reset);
            }
            if (field.description) row.title = field.description;
            if (field.randomizeLabel && field.type === "number" && field.min !== undefined && field.max !== undefined) {
              const randomize = document.createElement("button");
              randomize.type = "button";
              randomize.textContent = field.randomizeLabel;
              randomize.onclick = async (event) => {
                // The surrounding label must not activate/focus the Seed input after this click.
                event.preventDefault();
                if (randomize.disabled) return;
                const min = field.min!,
                  step = field.step ?? 1;
                const count = Math.floor((field.max! - min) / step) + 1;
                const currentIndex = Math.round((Number(input.value) - min) / step);
                const excludesCurrent = currentIndex >= 0 && currentIndex < count;
                const available = count - Number(excludesCurrent);
                if (available < 1) return;
                let index = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * available);
                if (excludesCurrent && index >= currentIndex) index++;
                const value = min + index * step;
                randomize.disabled = true;
                randomize.setAttribute("aria-busy", "true");
                randomize.textContent = "正在生成…";
                input.value = String(value);
                output.textContent = formatSpatialFieldValue(field, value);
                try {
                  const receipt = await commit([
                    { op: "set", entity: item.id, component: c.type, values: { [field.key]: value } }
                  ]);
                  randomize.textContent =
                    receipt.status === "rejected" ? "换布局未完成 · 查看诊断" : field.randomizeLabel!;
                } catch (error) {
                  randomize.textContent = "换布局未完成 · 查看诊断";
                  host.dispatchEvent(
                    new CustomEvent("planning-render-error", {
                      bubbles: true,
                      detail: "修改未能完成：" + String(error)
                    })
                  );
                } finally {
                  randomize.disabled = false;
                  randomize.removeAttribute("aria-busy");
                }
              };
              row.append(randomize);
            }
            if (pair) {
              let range = rangeRows.get(rangeKey!);
              if (!range) {
                range = document.createElement("fieldset");
                range.style.cssText =
                  "border:0;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;min-width:0";
                range.setAttribute("aria-label", field.label.replace(/下限|上限/g, "范围"));
                const note = document.createElement("small");
                note.setAttribute("role", "status");
                note.style.cssText = "grid-column:1/-1;padding:0 12px;color:#85502c";
                range.append(note);
                rangeRows.set(rangeKey!, range);
                group.append(range);
              }
              range.insertBefore(row, range.querySelector("small"));
            } else group.append(row);
            inputs.set(groupId + ":" + field.key, {
              input,
              output,
              reset,
              entity: item.id,
              component: c.type,
              field: field.key
            });
          }
          const category =
            tab && item.id === "world" ? PLANNING_COMPONENTS.find((d) => d.type === definition.type)?.group : undefined;
          if (category) {
            let parent = categories.get(category);
            if (!parent) {
              parent = document.createElement("details");
              parent.className = "base-control-group";
              parent.dataset.component = "category:" + category;
              parent.open = expanded.get(parent.dataset.component) ?? false;
              const heading = document.createElement("summary");
              heading.textContent = category;
              parent.append(heading);
              host.append(parent);
              categories.set(category, parent);
            }
            parent.append(group);
          } else host.append(group);
        }
      }
      for (const { item, c, definition } of groups)
        for (const field of definition.fields) {
          const key = item.id + ":" + c.type + ":" + field.key;
          recordEditors.get(key)?.update(c.values[field.key]);
          const ui = inputs.get(key);
          if (!ui) continue;
          const pair = definition.ranges?.find((keys) => keys.includes(field.key));
          if (pair && drafts.has(item.id + ":" + c.type + ":" + pair[0])) continue;
          const value = c.values[field.key];
          if (ui.input instanceof HTMLInputElement && field.type === "number") {
            const limits = c.limits[field.key];
            const scale = field.unit === "%" ? 100 : 1;
            const low = limits?.min ?? field.min,
              high = limits?.max ?? field.max;
            ui.input.min = low === undefined ? "" : String(low * scale);
            ui.input.max = high === undefined ? "" : String(high * scale);
          }
          if (ui.input instanceof HTMLInputElement && ui.input.type === "checkbox") ui.input.checked = Boolean(value);
          else
            ui.input.value = String(
              typeof value === "number" && field.unit === "%" ? Number((value * 100).toPrecision(12)) : (value ?? "")
            );
          const unset = value === undefined ? field.computedSource ?? (c.type === "layout" ? "未统一设置" : undefined) : undefined;
          if (ui.input instanceof HTMLInputElement) ui.input.placeholder = unset ?? "";
          ui.output.textContent = unset ?? formatSpatialFieldValue(field, value);
          if (ui.reset) ui.reset.hidden = !c.sources[field.key]?.includes(item.id);
        }
    }
  };
}
