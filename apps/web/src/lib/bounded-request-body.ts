// What: Buffers a request body up to a byte limit; rejects oversize bodies with 413.
// Used by: apps/web/src/app/api/orpc/[...rest]/route.ts, contact-runtime.ts, app/api/auth/[...all]/handler.ts.
// See: docs/debugging.md#symptom--where-to-look (413 payload too large).
export type BufferedBoundedRequest = Readonly<{
  request: Request;
  tooLarge: boolean;
}>;

export const bufferBoundedRequest = async (
  request: Request,
  maximumBytes: number
): Promise<BufferedBoundedRequest> => {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    await request.body?.cancel().catch(() => undefined);
    return { request, tooLarge: true };
  }
  if (request.body === null) return { request, tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      return { request, tooLarge: true };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.set("content-length", String(totalBytes));
  return {
    request: new Request(request.url, {
      body,
      headers,
      method: request.method,
      signal: request.signal,
    }),
    tooLarge: false,
  };
};
