/** Every `reference` string anywhere in a value, such as the references between the resources of a bundle. */
export function references(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(references);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "reference" && typeof child === "string"
      ? [child]
      : references(child),
  );
}
