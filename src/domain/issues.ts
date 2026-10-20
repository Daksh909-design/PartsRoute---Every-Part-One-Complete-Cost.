export function collectionIssues(errors: string[]) {
  const groups = new Map<
    string,
    { title: string; action: string; details: string[] }
  >();
  for (const detail of [...new Set(errors)]) {
    const kind = /Google|Gemini|extraction timed out|AI explanation/i.test(
      detail,
    )
      ? "extraction"
      : /shipping policy|placeholder/i.test(detail)
        ? "shipping"
        : "collection";
    const group = groups.get(kind) ?? {
      title:
        kind === "extraction"
          ? "Some product details could not be extracted"
          : kind === "shipping"
            ? "Shipping policy is incomplete"
            : "Some retailer checks could not finish",
      action:
        kind === "extraction"
          ? "Collected pages are saved. Refresh later to retry missing details."
          : kind === "shipping"
            ? "A matching cart check is needed before quoting delivery charges."
            : "Available observations remain usable; incomplete totals are not recommended.",
      details: [],
    };
    group.details.push(detail);
    groups.set(kind, group);
  }
  return [...groups.values()];
}
