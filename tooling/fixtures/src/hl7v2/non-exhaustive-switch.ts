export type Separator = "field" | "component" | "repetition";

export function symbolOf(separator: Separator): string {
  switch (separator) {
    case "field":
      return "|";
    case "component":
      return "^";
  }
  return "~";
}
