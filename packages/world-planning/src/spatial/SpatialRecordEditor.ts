import type { SpatialField } from "./SpatialDocument";

/** Coordinate/record editing submits one schema-validated authoring transaction. */
export function spatialRecordEditor(
  field: SpatialField,
  submit: (value: Record<string, unknown>[]) => Promise<unknown>
) {
  const element = document.createElement("div"),
    rows = document.createElement("div");
  element.className = "spatial-record-editor";
  let current: Record<string, unknown>[] = [],
    signature = "";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = "应用修改";
  apply.onclick = async () => {
    apply.disabled = true;
    try {
      await submit(structuredClone(current));
    } finally {
      apply.disabled = false;
    }
  };
  const render = () => {
    rows.replaceChildren();
    current.forEach((record, index) => {
      const row = document.createElement("fieldset"),
        legend = document.createElement("legend");
      legend.textContent = String(record.id ?? index + 1);
      row.append(legend);
      for (const column of field.columns ?? []) {
        const label = document.createElement("label"),
          input = document.createElement("input");
        label.textContent = column.label;
        input.type = column.type === "boolean" ? "checkbox" : column.type === "number" ? "number" : "text";
        if (column.choices) {
          const list = document.createElement("datalist");
          list.id = crypto.randomUUID();
          for (const choice of column.choices) {
            const option = document.createElement("option");
            option.value = choice;
            list.append(option);
          }
          row.append(list);
          input.setAttribute("list", list.id);
        }
        input.checked = record[column.key] === true;
        input.step = "any";
        input.value = String(record[column.key] ?? "");
        input.setAttribute("aria-label", `${field.label} ${index + 1} ${column.label}`);
        input.style.width = "80px";
        const read = () => {
          if (column.type === "boolean") {
            record[column.key] = input.checked;
            return;
          }
          if (!input.value.trim()) {
            delete record[column.key];
            return;
          }
          record[column.key] = column.type === "number" ? Number(input.value) : input.value;
        };
        input.oninput = read;
        input.onchange = read;
        label.append(input);
        row.append(label);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.onclick = () => {
        current.splice(index, 1);
        render();
      };
      row.append(remove);
      rows.append(row);
    });
  };
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "添加一项";
  add.onclick = () => {
    const previous = current.at(-1);
    current.push({
      ...Object.fromEntries(
        (field.columns ?? []).filter((c) => c.default !== undefined).map((c) => [c.key, c.default])
      ),
      ...previous,
      id: crypto.randomUUID(),
      ...(previous?.x !== undefined ? { x: Number(previous.x) + 1 } : {})
    });
    render();
  };
  element.append(rows, add, apply);
  return {
    element,
    update(value: unknown) {
      const next = JSON.stringify(value ?? []);
      if (signature === next) return;
      signature = next;
      current = structuredClone((value ?? []) as Record<string, unknown>[]);
      render();
    }
  };
}
