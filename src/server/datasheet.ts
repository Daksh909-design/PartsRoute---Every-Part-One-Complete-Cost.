import { extractText, getDocumentProxy } from "unpdf";
import type { Retailer } from "../domain/schema";
import { requestSignal } from "./deadline";
import { safeRetailerUrl } from "./urls";
import { quotedValue } from "./grounding";

async function readBounded(response: Response, maxBytes: number) {
  if (!response.ok || !response.body)
    throw new Error("Product resource unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Product resource exceeds the reading limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function datasheetSpecs(text: string, model: string) {
  if (!quotedValue(text.slice(0, 2000), model)) return [];
  const specs: { key: string; value: string; excerpt: string }[] = [];
  // A dimensioned connector description explicitly counts physical header
  // pins; signal-pin descriptions and diagram section numbers do not.
  const headers = [
    ...text.matchAll(
      /\b(\d{1,3})\s*[x×]\s*\d+(?:\.\d+)?\s*["′]?[ \t]+Pitch[ \t]+(?:Right[ \t]+Angle[ \t]+)?Header[ \t]+Pins(?:Board[ \t]+Connections)?\b/gi,
    ),
  ];
  if (headers.length && new Set(headers.map((match) => match[1])).size === 1)
    specs.push({ key: "pins", value: headers[0][1], excerpt: headers[0][0] });
  const voltages = [
    ...text.matchAll(
      /\bOperating[ \t]+Voltage[ \t]+(\d+(?:\.\d+)?[ \t]*V[ \t]*(?:DC|AC)?)\b/gi,
    ),
  ];
  if (voltages.length && new Set(voltages.map((match) => match[1])).size === 1)
    specs.push({
      key: "voltage",
      value: voltages[0][1],
      excerpt: voltages[0][0],
    });
  return specs;
}

export async function productDatasheet(
  url: string,
  retailer: Retailer,
  model: string,
  deadline = Infinity,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const fetchResource = (source: string) =>
    transport(safeRetailerUrl(source, retailer), {
      redirect: "error",
      signal: requestSignal(deadline, 5000, signal),
    });
  const html = new TextDecoder().decode(
    await readBounded(await fetchResource(url), 2_000_000),
  );
  const links = [
    ...html.matchAll(
      /<a\b[^>]*\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ]
    .filter((link) => /\bdatasheet\b/i.test(link[2]))
    .map((link) => new URL(link[1].replaceAll("&amp;", "&"), url).toString());
  const sources = [...new Set(links)];
  if (sources.length !== 1) return null;
  const sourceUrl = safeRetailerUrl(sources[0], retailer);
  const bytes = await readBounded(await fetchResource(sourceUrl), 2_000_000);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("Linked datasheet is not a PDF");
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > 12) throw new Error("Datasheet exceeds the page limit");
    signal?.throwIfAborted();
    const { text } = await extractText(pdf, { mergePages: true });
    signal?.throwIfAborted();
    return {
      linkedFrom: url,
      sourceUrl,
      text,
      specs: datasheetSpecs(text, model),
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
