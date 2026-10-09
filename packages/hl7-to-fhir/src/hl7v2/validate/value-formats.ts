import type { IssueCode } from "../../shared/issue";
import {
  isCode,
  isDate,
  isDateTime,
  isNumber,
  isSequenceId,
  isTime,
} from "./formats";

/** The format of a primitive data type and the code that reports a value that does not have it. */
export interface ValueFormat {
  readonly code: IssueCode;
  readonly isValid: (text: string) => boolean;
}

/**
 * The primitive data types with a format, keyed by identifier. The text types (ST, TX, FT) have none: their length is
 * not checked either, as receivers differ in what they accept.
 */
export const valueFormats: ReadonlyMap<string, ValueFormat> = new Map([
  ["NM", { code: "INVALID_NUMBER", isValid: isNumber }],
  ["SI", { code: "INVALID_SEQUENCE_ID", isValid: isSequenceId }],
  ["DT", { code: "INVALID_DATE", isValid: isDate }],
  ["DTM", { code: "INVALID_DATE_TIME", isValid: isDateTime }],
  ["TM", { code: "INVALID_TIME", isValid: isTime }],
  ["ID", { code: "MALFORMED_CODE", isValid: isCode }],
  ["IS", { code: "MALFORMED_CODE", isValid: isCode }],
]);

/** Whether `text` has the format of `dataType`; a type without a format accepts every text. */
export function hasFormat(dataType: string, text: string): boolean {
  return valueFormats.get(dataType)?.isValid(text) ?? true;
}
