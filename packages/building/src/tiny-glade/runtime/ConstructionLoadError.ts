/** Loading failures can recover without changing author geometry. Compilation
 * errors are deliberately not classified here, so bad geometry is not retried. */
export class ConstructionLoadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ConstructionLoadError";
  }
}

export async function constructionResponse(url: URL): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new ConstructionLoadError(`Construction resource unavailable: ${url.href}`, true, { cause });
  }
  if (!response.ok)
    throw new ConstructionLoadError(
      `Construction resource HTTP ${response.status}: ${url.href}`,
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  return response;
}

/** A successful header does not mean that the asset body arrived. Keep transport
 * failures retryable through body consumption; parse/ABI validation happens later. */
export async function constructionBytes(url: URL): Promise<ArrayBuffer> {
  const response = await constructionResponse(url);
  try {
    return await response.arrayBuffer();
  } catch (cause) {
    throw new ConstructionLoadError(`Construction resource body unavailable: ${url.href}`, true, { cause });
  }
}
export async function constructionJSON(url: URL): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await constructionBytes(url)));
}
