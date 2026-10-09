// Which message structure a message follows: MSH-9.3 names it; older senders leave it out, and then the message code
// and trigger event in MSH-9.1 and MSH-9.2 decide: an acknowledgment is an ACK, and other messages follow the event
// map of HL7 table 0354.
import type { Issue, Location, Span } from "../shared/issue";
import { report } from "../shared/collect";
import { emptySpanAt } from "../shared/span";
import { messageStructureByEvent } from "./definitions/message-structure-events";
import { messageStructures } from "./definitions/message-structures";
import type { MessageStructureDefinition } from "./definitions/types";
import {
  headerSegmentId,
  messageCodeComponent,
  messageStructureComponent,
  messageTypeField,
  triggerEventComponent,
} from "./header";
import type { Hl7Message, Repetition, Segment } from "./model";

/** The message code of acknowledgments, whose structure is `ACK` whatever event they acknowledge. */
const acknowledgment = "ACK";

/** The structure a message follows, as far as MSH-9 and the library's definitions tell. */
export interface ResolvedStructure {
  /** The structure identifier, such as `ADT_A01`; absent when MSH-9 identifies no structure. */
  readonly id?: string | undefined;
  /** The definition of the structure; absent when the library has none. */
  readonly definition?: MessageStructureDefinition | undefined;
}

/**
 * Finds the message structure of a message: MSH-9.3 when it holds text, otherwise the structure that MSH-9.1 and
 * MSH-9.2 imply: `ACK` for an acknowledgment, and for other messages the one HL7 table 0354 assigns to the message
 * code and trigger event (`ADT^A04` is `ADT_A01`).
 *
 * @param message - The message; its first segment is expected to be MSH.
 * @param issues - Receives `MESSAGE_STRUCTURE_UNKNOWN` when no structure is identified,
 *   `MESSAGE_STRUCTURE_MISMATCH` when MSH-9.3 contradicts MSH-9.1 and MSH-9.2, and `MESSAGE_STRUCTURE_UNSUPPORTED`
 *   when the library has no definition of the structure.
 */
export function resolveStructure(
  message: Hl7Message,
  issues: Issue[],
): ResolvedStructure {
  const first = message.segments[0];
  const header = first?.id === headerSegmentId ? first : undefined;
  const messageType = header?.fields[messageTypeField - 1];
  const repetition = messageType?.repetitions[0];
  const named = textOf(repetition, messageStructureComponent);
  const code = textOf(repetition, messageCodeComponent)?.text;
  const event = textOf(repetition, triggerEventComponent)?.text;
  const implied = impliedStructure(code, event);
  const id = named?.text ?? implied;

  const typeSpan = messageType?.span ?? emptySpanAt(first?.span.end ?? 0);
  if (id === undefined) {
    const location = headerLocation(typeSpan, header);
    report(issues, "MESSAGE_STRUCTURE_UNKNOWN", location);
    return {};
  }
  // The span of MSH-9.3 when it named the structure, otherwise the span of MSH-9.
  const location =
    named === undefined
      ? headerLocation(typeSpan, header)
      : headerLocation(named.span, header, messageStructureComponent);
  // Only a message with all three components can contradict itself; the structure it names is the one followed.
  if (
    named !== undefined &&
    event !== undefined &&
    implied !== undefined &&
    implied !== named.text
  ) {
    report(issues, "MESSAGE_STRUCTURE_MISMATCH", location, named.text);
  }
  const definition = messageStructures.get(id);
  if (definition === undefined) {
    report(issues, "MESSAGE_STRUCTURE_UNSUPPORTED", location, id);
    return { id };
  }
  return { id, definition };
}

/**
 * The structure MSH-9.1 and MSH-9.2 imply: `ACK` for every acknowledgment, otherwise the one HL7 table 0354 assigns
 * to the message code and trigger event, if any.
 */
function impliedStructure(
  code: string | undefined,
  event: string | undefined,
): string | undefined {
  if (code === acknowledgment) return acknowledgment;
  return code === undefined || event === undefined
    ? undefined
    : messageStructureByEvent.get(`${code}^${event}`);
}

/** The text of the first subcomponent of a component, with its span, when it holds any. */
function textOf(
  repetition: Repetition | undefined,
  component: number,
): { readonly text: string; readonly span: Span } | undefined {
  const subcomponent = repetition?.components[component - 1]?.subcomponents[0];
  return subcomponent?.kind === "value" && subcomponent.value !== ""
    ? { text: subcomponent.value, span: subcomponent.span }
    : undefined;
}

/** A location in MSH-9 of the header, or only a span when the message has no header. */
function headerLocation(
  span: Span,
  header: Segment | undefined,
  component?: number,
): Location {
  if (header === undefined) return { span };
  const field = { span, segmentIndex: 0, segmentId: headerSegmentId };
  return component === undefined
    ? { ...field, field: messageTypeField }
    : { ...field, field: messageTypeField, repetition: 1, component };
}
