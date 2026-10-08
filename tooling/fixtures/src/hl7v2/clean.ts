/**
 * Counts the segments of a message.
 *
 * @param message - An HL7 v2 message with `\r` segment terminators.
 * @returns The number of non-empty segments.
 */
export function countSegments(message: string): number {
  return message.split("\r").filter((segment) => segment.length > 0).length;
}
