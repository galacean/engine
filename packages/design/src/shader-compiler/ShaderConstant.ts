/** Link-time values of the GLSL constant declarations on which uniform array sizes depend. */
export interface ShaderConstant {
  type: string;
  values: number[];
  /** Column length of a column-major matrix. Scalars and vectors omit this field. */
  rows?: number;
}

const precedence: Record<string, number> = {
  "||": 1,
  "^^": 2,
  "&&": 3,
  "|": 4,
  "^": 5,
  "&": 6,
  "==": 7,
  "!=": 7,
  "<": 8,
  "<=": 8,
  ">": 8,
  ">=": 8,
  "<<": 9,
  ">>": 9,
  "+": 10,
  "-": 10,
  "*": 11,
  "/": 11,
  "%": 11
};
const unaryMath: Record<string, (x: number) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
  fract: (x) => x - Math.floor(x),
  abs: Math.abs,
  sign: Math.sign
};
function cast(type: string, value: number): number {
  return type === "int"
    ? value | 0
    : type === "uint"
      ? value >>> 0
      : type === "bool"
        ? Number(!!value)
        : Math.fround(value);
}
function binary(op: string, a: number, b: number, type: string): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return type === "float" ? a * b : Math.imul(a, b);
    case "/":
      return a / b;
    case "%":
      return a % b;
    case "<<":
      return a << b;
    case ">>":
      return type === "uint" ? a >>> b : a >> b;
    case "&":
      return a & b;
    case "|":
      return a | b;
    case "^":
      return a ^ b;
    case "==":
      return Number(a === b);
    case "!=":
      return Number(a !== b);
    case "<":
      return Number(a < b);
    case ">":
      return Number(a > b);
    case "<=":
      return Number(a <= b);
    case ">=":
      return Number(a >= b);
    case "&&":
      return Number(!!a && !!b);
    case "||":
      return Number(!!a || !!b);
    case "^^":
      return Number(!!a !== !!b);
    default:
      return NaN;
  }
}
/** GLSL can contract or reorder floating point matrix operations. Fold only exact intermediates. */
function exact(value: number): number {
  return Math.fround(value) === value ? value : NaN;
}

function determinant(values: readonly number[], n: number): number {
  if (n === 1) return values[0];
  let sum = 0;
  for (let row = 0; row < n; row++) {
    const minor = values.filter((_, index) => index >= n && index % n !== row);
    const term = exact(values[row] * determinant(minor, n - 1));
    sum = exact(sum + (row % 2 ? -term : term));
  }
  return sum;
}

function matrixProduct(a: ShaderConstant, b: ShaderConstant): ShaderConstant | undefined {
  // A vector on the left is a row vector; a vector on the right is a column.
  const rows = a.rows ?? 1;
  const inner = a.values.length / rows;
  const rightRows = b.rows ?? b.values.length;
  if (inner !== rightRows) return;
  const columns = b.values.length / rightRows;
  const values: number[] = [];
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum = exact(sum + exact(a.values[k * rows + row] * b.values[column * rightRows + k]));
      }
      if (!Number.isFinite(sum)) return;
      values.push(sum);
    }
  }
  return { type: "float", rows: a.rows && b.rows ? rows : undefined, values };
}

function call(name: string, args: ShaderConstant[]): ShaderConstant | undefined {
  if (!args.length) return;
  const first = args[0];
  if (name === "determinant" && first.rows && first.values.length === first.rows ** 2) {
    const value = determinant(first.values, first.rows);
    if (Number.isFinite(value)) return { type: "float", values: [value] };
    return;
  }
  const matrix = /^mat([234])(?:x([234]))?$/.exec(name);
  if (matrix) {
    const columns = Number(matrix[1]);
    const rows = Number(matrix[2] ?? matrix[1]);
    let values: number[];
    if (args.length === 1 && (first.rows || first.values.length === 1)) {
      values = Array.from({ length: columns * rows }, (_, index) => {
        const row = index % rows;
        const column = Math.floor(index / rows);
        if (first.rows && row < first.rows && column < first.values.length / first.rows)
          return first.values[column * first.rows + row];
        return row === column ? (first.rows ? 1 : first.values[0]) : 0;
      });
    } else {
      values = args.flatMap((arg) => arg.values).slice(0, columns * rows);
      if (values.length !== columns * rows) return;
    }
    return { type: "float", rows, values: values.map(Math.fround) };
  }
  const vector = /^([iub]?)vec([234])$/.exec(name);
  if (vector || /^(float|int|uint|bool)$/.test(name)) {
    const width = vector ? Number(vector[2]) : 1;
    const type = vector ? ({ i: "int", u: "uint", b: "bool" }[vector[1]] ?? "float") : name;
    const values = args.flatMap((arg) => arg.values);
    if (values.length === 1 && width > 1) return { type, values: Array(width).fill(cast(type, values[0])) };
    if (values.length < width) return;
    return { type, values: values.slice(0, width).map((n) => cast(type, n)) };
  }
  if (name === "dot" || name === "length" || name === "distance") {
    const b = args[1]?.values;
    const sum = first.values.reduce(
      (sum, x, i) => exact(sum + exact(name === "dot" ? x * b[i] : exact(x - (b?.[i] ?? 0)) ** 2)),
      0
    );
    const value = name === "dot" ? sum : exact(Math.sqrt(sum));
    if (Number.isFinite(value)) return { type: "float", values: [value] };
    return;
  }
  const width = Math.max(...args.map((arg) => arg.values.length));
  const values: number[] = [];
  for (let i = 0; i < width; i++) {
    const [a, b, c] = args.map((arg) => arg.values[arg.values.length === 1 ? 0 : i]);
    let n;
    if (Object.prototype.hasOwnProperty.call(unaryMath, name)) n = unaryMath[name](a);
    else if (name === "min") n = Math.min(a, b);
    else if (name === "max") n = Math.max(a, b);
    else if (name === "clamp") n = Math.min(Math.max(a, b), c);
    else if (name === "step") n = Number(b >= a);
    else return;
    values.push(cast(first.type, n));
  }
  return { type: first.type, values };
}

/** Evaluate only constant syntax. No authored shader text is executed as JavaScript. */
export function shaderConstant(
  expression: string,
  resolveIdentifier: (name: string) => ShaderConstant | undefined
): ShaderConstant | undefined {
  const tokens =
    expression.match(
      /0[xX][\da-fA-F]+[uU]?|(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?[uUfF]?|[A-Za-z_]\w*|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[^\s]/g
    ) ?? [];
  let pos = 0;
  function parse(min = 0): ShaderConstant | undefined {
    const token = tokens[pos++];
    if (!token) return;
    let value: ShaderConstant | undefined;
    if (token === "(") {
      value = parse();
      if (tokens[pos++] !== ")") return;
    } else if (token === "-" || token === "+" || token === "~" || token === "!") {
      const operand = parse(12);
      if (!operand) return;
      value = {
        type: token === "!" ? "bool" : operand.type,
        rows: operand.rows,
        values: operand.values.map((n) =>
          cast(operand.type, token === "-" ? -n : token === "~" ? ~n : token === "!" ? Number(!n) : n)
        )
      };
    } else if (tokens[pos] === "(") {
      pos++;
      const args: ShaderConstant[] = [];
      while (true) {
        const arg = parse();
        if (!arg) return;
        args.push(arg);
        if (tokens[pos] !== ",") break;
        pos++;
      }
      if (tokens[pos++] !== ")") return;
      value = call(token, args);
    } else if (/^(?:\d|\.)/.test(token)) {
      const hex = /^0[xX]/.test(token);
      const type = /u$/i.test(token) ? "uint" : !hex && /[.ef]/i.test(token) ? "float" : "int";
      const literal = token.replace(hex ? /u$/i : /[fu]$/i, "");
      const n = !hex && type !== "float" && /^0[0-7]+$/.test(literal) ? parseInt(literal, 8) : Number(literal);
      value = { type, values: [cast(type, n)] };
    } else if (token === "true" || token === "false") {
      value = { type: "bool", values: [Number(token === "true")] };
    } else value = resolveIdentifier(token);
    if (!value) return;
    while (tokens[pos] === "." || tokens[pos] === "[") {
      if (tokens[pos++] === ".") {
        const swizzle = tokens[pos++] ?? "";
        const letters = ["xyzw", "rgba", "stpq"].find((set) => Array.from(swizzle).every((ch) => set.includes(ch)));
        if (!letters) return;
        const input = value.values;
        value = { type: value.type, values: Array.from(swizzle, (ch) => input[letters.indexOf(ch)]) };
      } else {
        const index = parse();
        if (!index || tokens[pos++] !== "]") return;
        const start = index.values[0] * (value.rows ?? 1);
        value = { type: value.type, values: value.values.slice(start, start + (value.rows ?? 1)) };
      }
    }
    while (Object.prototype.hasOwnProperty.call(precedence, tokens[pos]) && precedence[tokens[pos]] >= min) {
      const op = tokens[pos++];
      const rhs = parse(precedence[op] + 1);
      if (!rhs) return;
      const a = value;
      if (op === "==" || op === "!=") {
        const equal = a.values.length === rhs.values.length && a.values.every((n, i) => n === rhs.values[i]);
        value = { type: "bool", values: [Number(op === "==" ? equal : !equal)] };
        continue;
      }
      const matrix = a.rows ?? rhs.rows;
      if (matrix && op === "*" && a.values.length > 1 && rhs.values.length > 1) {
        value = matrixProduct(a, rhs);
        if (!value) return;
        continue;
      }
      const operandType = a.type === "float" || rhs.type === "float" ? "float" : a.type;
      const type = /^(?:<=|>=|<|>|&&|\|\||\^\^)$/.test(op) ? "bool" : operandType;
      const width = Math.max(a.values.length, rhs.values.length);
      value = {
        type,
        rows: matrix,
        values: Array.from({ length: width }, (_, i) =>
          cast(
            type,
            binary(
              op,
              a.values[a.values.length === 1 ? 0 : i],
              rhs.values[rhs.values.length === 1 ? 0 : i],
              operandType
            )
          )
        )
      };
    }
    if (!min && tokens[pos] === "?") {
      pos++;
      const yes = parse();
      if (tokens[pos++] !== ":") return;
      const no = parse();
      if (!yes || !no) return;
      value = value.values[0] ? yes : no;
    }
    return value;
  }
  const result = parse();
  return result && pos === tokens.length && result.values.every(Number.isFinite) ? result : undefined;
}
