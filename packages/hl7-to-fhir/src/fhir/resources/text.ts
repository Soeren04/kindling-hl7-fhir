// Text values (ST, TX, FT) as FHIR strings. Free text cannot hold components, but senders often write the component
// separator into it unescaped, which splits it; the text is joined back with the separators it was split at, so a
// result such as `positive^see note` arrives whole. Line breaks (`\.br\`) are already line feeds in the message tree.
import type { Delimiters } from "../../hl7v2/model";
import { isIgnoredNull, type MappingContext, text } from "../context";
import type { Source } from "../source";

/** The separators a text value may have been split at. */
export type TextDelimiters = Pick<Delimiters, "component" | "subcomponent">;

/**
 * The text of a value with its components and subcomponents joined back; `undefined` when it holds none. A value in
 * a component or subcomponent position has no components to join, so it is read as text.
 */
export function joinedText(
  context: MappingContext,
  source: Source | undefined,
  delimiters: TextDelimiters,
): string | undefined {
  if (source === undefined || !("components" in source.node)) {
    return text(context, source);
  }
  if (isIgnoredNull(context, source)) return undefined;
  // Without a subcomponent separator a component has a single subcomponent, so nothing is joined.
  const subcomponentSeparator = delimiters.subcomponent ?? "";
  const joined = source.node.components
    .map(({ subcomponents }) =>
      subcomponents
        .map((subcomponent) =>
          subcomponent.kind === "value" ? subcomponent.value : "",
        )
        .join(subcomponentSeparator),
    )
    .join(delimiters.component);
  return joined === "" ? undefined : joined;
}

/**
 * The lines of every repetition of a text field as one string, one repetition per line: a repeating TX or FT continues
 * the same text.
 */
export function joinedLines(
  context: MappingContext,
  sources: readonly Source[],
  delimiters: TextDelimiters,
): string | undefined {
  const lines = sources
    .map((source) => joinedText(context, source, delimiters))
    .filter((line) => line !== undefined);
  return lines.length === 0 ? undefined : lines.join("\n");
}
