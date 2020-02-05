const DELIMITER = "/";

export function split(path) {
  const parts = path.split(DELIMITER);
  const tail = parts.slice(parts.length - 1)[0];
  const head = parts.slice(0, parts.length - 1).join(DELIMITER);
  return [head, tail];
}

export function getBasename(path) {
  return split(path)[1];
}

export function getDirectory(path) {
  const parts = path.split(DELIMITER);
  return parts.slice(0, parts.length - 1).join(DELIMITER);
}

export function isRelativePath(s) {
  return s.charAt(0) !== "/" && s.match(/:\/\//) === null;
}

export function join(path1, path2) {
  // FIXME: add multi paths & / judge
  return path1 + DELIMITER + path2;
}

export function getExtension(path) {
  const ext = path
    .split("?")[0]
    .split(".")
    .pop();
  if (ext !== path) {
    return "." + ext;
  } else {
    return "";
  }
}

export function extractPath(s) {
  let path = ".";
  const parts = s.split("/");
  let i = 0;

  if (parts.length > 1) {
    if (isRelativePath(s) === false) {
      path = "";
    }
    for (i = 0; i < parts.length - 1; ++i) {
      path += DELIMITER + parts[i];
    }
  }
  return path;
}
