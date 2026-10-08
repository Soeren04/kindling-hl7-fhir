import { describe, expect, it } from "vitest";

import {
  indexOfOrEnd,
  locateContent,
  terminatorLength,
} from "../../src/hl7v2/input";
import type { IssueCode, Span } from "../../src/shared/issue";

/** The located content as text, and the removed parts as [code, removed text] pairs. */
function located(input: string): [string, [IssueCode, string][]] {
  const { span, issues } = locateContent(input);
  const slice = ({ start, end }: Span) => input.slice(start, end);
  return [
    slice(span),
    issues.map(({ code, location }) => [code, slice(location.span)]),
  ];
}

describe("locateContent", () => {
  it.each<[string, string, string, [IssueCode, string][]]>([
    ["a plain message", "MSH|1\rPID|1", "MSH|1\rPID|1", []],
    ["a final terminator", "MSH|1\r", "MSH|1\r", []],
    ["a final CRLF terminator", "MSH|1\r\n", "MSH|1\r\n", []],
    [
      "a byte order mark",
      "\uFEFFMSH|1",
      "MSH|1",
      [["BYTE_ORDER_MARK_REMOVED", "\uFEFF"]],
    ],
    [
      "an MLLP frame",
      "\u000BMSH|1\r\u001C\r",
      "MSH|1\r",
      [
        ["MLLP_FRAMING_REMOVED", "\u000B"],
        ["MLLP_FRAMING_REMOVED", "\u001C\r"],
      ],
    ],
    [
      "a byte order mark before an MLLP frame",
      "\uFEFF\u000BMSH|1\u001C",
      "MSH|1",
      [
        ["BYTE_ORDER_MARK_REMOVED", "\uFEFF"],
        ["MLLP_FRAMING_REMOVED", "\u000B"],
        ["MLLP_FRAMING_REMOVED", "\u001C"],
      ],
    ],
    [
      "whitespace after the final terminator",
      "MSH|1\r\n \t\r",
      "MSH|1\r\n",
      [["TRAILING_WHITESPACE_REMOVED", " \t\r"]],
    ],
    [
      "spaces before the final terminator",
      "MSH|1  \r",
      "MSH|1",
      [["TRAILING_WHITESPACE_REMOVED", "  \r"]],
    ],
    [
      "whitespace after an MLLP frame",
      "MSH|1\r\u001C\r\n\n",
      "MSH|1\r",
      [
        ["MLLP_FRAMING_REMOVED", "\u001C\r"],
        ["TRAILING_WHITESPACE_REMOVED", "\n\n"],
      ],
    ],
    ["nothing", "", "", []],
    ["whitespace only", " \n", "", [["TRAILING_WHITESPACE_REMOVED", " \n"]]],
    ["an end block alone", "\u001C", "", [["MLLP_FRAMING_REMOVED", "\u001C"]]],
  ])("handles %s", (_description, input, content, issues) => {
    expect(located(input)).toStrictEqual([content, issues]);
  });

  it("keeps an end block that is not at the end", () => {
    expect(located("MSH|\u001C|1")).toStrictEqual(["MSH|\u001C|1", []]);
  });
});

describe("terminatorLength", () => {
  it.each([
    ["\r", 0, 1, 1],
    ["\n", 0, 1, 1],
    ["\r\n", 0, 2, 2],
    ["\r\n", 0, 1, 1],
    ["\n\r", 0, 2, 1],
    ["a\r", 0, 2, 0],
    ["\r", 1, 1, 0],
  ])("reads %j at %i before %i as %i", (input, index, end, length) => {
    expect(terminatorLength(input, index, end)).toBe(length);
  });
});

describe("indexOfOrEnd", () => {
  it("finds the character inside the range", () => {
    expect(indexOfOrEnd("a|b|c", "|", 2, 5)).toBe(3);
  });

  it("returns the end of the range when the character only occurs after it", () => {
    expect(indexOfOrEnd("a|b|c", "|", 2, 3)).toBe(3);
    expect(indexOfOrEnd("abc|", "|", 0, 2)).toBe(2);
  });
});
