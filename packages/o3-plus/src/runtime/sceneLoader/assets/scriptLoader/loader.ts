export function loadScript(src: string): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement("script") as HTMLScriptElement;
    scriptElement.onload = () => {
      resolve(scriptElement);
    };
    scriptElement.onerror = () => {
      reject(scriptElement);
    };
    scriptElement.src = src;
    document.body.appendChild(scriptElement);
  });
}

export function loadScripts(srcs: string[]) {
  return Promise.all(srcs.map(value => loadScript(value)));
}
