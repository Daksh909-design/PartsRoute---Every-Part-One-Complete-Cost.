// Remove known store furniture, retaining verbatim main-page text for grounding.
// The original TinyFish response is always stored separately and left intact.
export function extractionContent(text: string): string {
  const heading = text.search(/^# /m);
  let main = heading >= 0 ? text.slice(heading) : text;
  const related = main.search(
    /^#{1,4}\s+(?:You May Also Like|Related products|Recently Viewed Products|Customer Reviews)\s*$/im,
  );
  if (related >= 0) main = main.slice(0, related);
  return main.slice(0, 24000);
}
