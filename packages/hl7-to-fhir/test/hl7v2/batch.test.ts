import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { splitBatch } from "../../src/hl7v2/batch";
import { parse } from "../../src/hl7v2/parse";
import type { IssueCode, Severity } from "../../src/shared/issue";
import { parsed } from "./helpers";

const adt = "MSH|^~\\&|ADT1|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1";
const oru = "MSH|^~\\&|LAB|HOSP|||20240115103100||ORU^R01|MSG00002|P|2.5.1";
const bom = "\uFEFF";
const start = "\u000B";
const end = "\u001C\r";

/** The messages, and the issues as [code, severity, raw text of the location]. */
function split(input: string): [string[], [IssueCode, Severity, string][]] {
  const { messages, issues } = splitBatch(input);
  return [
    [...messages],
    issues.map(({ code, severity, location }) => [
      code,
      severity,
      input.slice(location?.span.start, location?.span.end),
    ]),
  ];
}

describe("splitBatch", () => {
  describe("messages", () => {
    it.each([
      ["no input", "", []],
      ["blank input", " \r\n\t\r", []],
      ["one message without terminator", adt, [adt]],
      [
        "one message with its terminator",
        `${adt}\rPID|1\r`,
        [`${adt}\rPID|1\r`],
      ],
      [
        "concatenated messages",
        `${adt}\rPID|1\r${oru}\rPID|2\r`,
        [`${adt}\rPID|1\r`, `${oru}\rPID|2\r`],
      ],
      [
        "line feed terminators, kept as written",
        `${adt}\nPID|1\n${oru}\nPID|2\n`,
        [`${adt}\nPID|1\n`, `${oru}\nPID|2\n`],
      ],
      [
        "carriage return and line feed terminators, kept as written",
        `${adt}\r\nPID|1\r\n${oru}\r\nPID|2`,
        [`${adt}\r\nPID|1\r\n`, `${oru}\r\nPID|2`],
      ],
      [
        "blank lines between messages",
        `${adt}\r\r \t\r\n\n${oru}\r`,
        [`${adt}\r`, `${oru}\r`],
      ],
      [
        "a blank line inside a message, left for parse to report",
        `${adt}\r\rPID|1\r${oru}`,
        [`${adt}\r\rPID|1\r`, oru],
      ],
      [
        "Z segments and unknown segments inside a message",
        `${adt}\rZPI|1\rXYZ|2\r${oru}`,
        [`${adt}\rZPI|1\rXYZ|2\r`, oru],
      ],
      [
        "an identifier that merely starts like MSH",
        `${adt}\rMSHX|1\rMSH`,
        [`${adt}\rMSHX|1\r`, "MSH"],
      ],
      [
        "a segment shorter than an identifier",
        `${adt}\rMS\rPID|1`,
        [`${adt}\rMS\rPID|1`],
      ],
    ])("splits %s", (_description, input, expected) => {
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual(expected);
      expect(issues).toStrictEqual([]);
    });

    it("returns messages that parse", () => {
      const { messages } = splitBatch(`${adt}\rPID|1||1\r${oru}\rPID|1||2\r`);
      expect(
        messages.map((message) => parsed(message).message.version),
      ).toStrictEqual(["2.5.1", "2.5.1"]);
    });
  });

  describe("batch envelopes", () => {
    it("drops FHS, BHS, BTS and FTS without a remark", () => {
      const input = `FHS|^~\\&|LAB\rBHS|^~\\&|LAB\r${adt}\rPID|1\r${oru}\rBTS|2\rFTS|1\r`;
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual([`${adt}\rPID|1\r`, `${oru}\r`]);
      expect(issues).toStrictEqual([]);
    });

    it("splits several batches in one file", () => {
      const input = `FHS|^~\\&\rBHS|^~\\&\r${adt}\rBTS|1\rBHS|^~\\&\r${oru}\r${adt}\rBTS|2\rFTS|2`;
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual([`${adt}\r`, `${oru}\r`, `${adt}\r`]);
      expect(issues).toStrictEqual([]);
    });

    it("accepts a batch without file envelope and messages directly in a file", () => {
      expect(split(`BHS|^~\\&\r${adt}\rBTS|1`)[1]).toStrictEqual([]);
      expect(split(`FHS|^~\\&\r${adt}\r${oru}\rFTS|0`)[1]).toStrictEqual([]);
    });

    it("splits an empty batch", () => {
      expect(split("FHS|^~\\&\rBHS|^~\\&\rBTS|0\rFTS|1")).toStrictEqual([
        [],
        [],
      ]);
    });

    it("reads the trailer with the delimiter of its own segment", () => {
      expect(split(`BHS#^~\\&\r${adt}\rBTS#1\r`)[1]).toStrictEqual([]);
      expect(split(`BHS#^~\\&\r${adt}\rBTS#2\r`)[1]).toStrictEqual([
        ["BATCH_COUNT_MISMATCH", "warning", "2"],
      ]);
    });

    it("reads only the first field of a trailer", () => {
      expect(split(`${adt}\rBTS|1|a comment|2\r`)[1]).toStrictEqual([]);
    });

    it.each([
      ["BTS-1 above the number of messages", `${adt}\rBTS|2`, "2"],
      ["BTS-1 below the number of messages", `${adt}\r${oru}\rBTS|1`, "1"],
      ["a BTS-1 that is not a number", `${adt}\rBTS|one`, "one"],
      ["a negative BTS-1", `${adt}\rBTS|-1`, "-1"],
      ["a decimal BTS-1", `${adt}\rBTS|1.0`, "1.0"],
      [
        "FTS-1 above the number of batches",
        `BHS|^~\\&\r${adt}\rBTS|1\rFTS|2`,
        "2",
      ],
      ["FTS-1 for a file without batches", `${adt}\rFTS|1`, "1"],
    ])("warns about %s", (_description, input, raw) => {
      const { issues } = splitBatch(input);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: "BATCH_COUNT_MISMATCH",
        severity: "warning",
        location: { field: 1 },
      });
      expect(split(input)[1]).toStrictEqual([
        ["BATCH_COUNT_MISMATCH", "warning", raw],
      ]);
    });

    it("tells the trailer in the location", () => {
      const { issues } = splitBatch(`${adt}\rBTS|5\rFTS|9`);
      expect(issues.map(({ location }) => location?.segmentId)).toStrictEqual([
        "BTS",
        "FTS",
      ]);
    });

    it.each([
      ["an empty BTS-1", `${adt}\rBTS|`],
      ["a BTS without fields", `${adt}\rBTS`],
      ["a BTS-1 with spaces around the count", `${adt}\rBTS| 1 `],
      ["a BTS-1 with leading zeros", `${adt}\rBTS|001`],
    ])("accepts %s", (_description, input) => {
      expect(split(input)[1].map(([code]) => code)).not.toContain(
        "BATCH_COUNT_MISMATCH",
      );
    });

    it("counts messages again after a trailer", () => {
      const input = `${adt}\rBTS|1\r${oru}\rBTS|1\r`;
      expect(split(input)[1]).toStrictEqual([]);
    });
  });

  describe("MLLP framing", () => {
    it("removes the frame of one message and reports it", () => {
      const [messages, issues] = split(`${start}${adt}\rPID|1\r${end}`);
      expect(messages).toStrictEqual([`${adt}\rPID|1\r`]);
      expect(issues).toStrictEqual([
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAMING_REMOVED", "info", end],
      ]);
    });

    it("splits a stream of frames", () => {
      const input = `${start}${adt}\r${end}${start}${oru}\r${end}`;
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual([`${adt}\r`, `${oru}\r`]);
      expect(issues.map(([code]) => code)).toStrictEqual(
        Array.from({ length: 4 }, () => "MLLP_FRAMING_REMOVED"),
      );
    });

    it("accepts frames without segment terminator before the end block", () => {
      const [messages] = split(`${start}${adt}\u001C\r${start}${oru}\u001C\r`);
      expect(messages).toStrictEqual([adt, oru]);
    });

    it("accepts an end block without carriage return", () => {
      const [messages, issues] = split(
        `${start}${adt}\r\u001C${start}${oru}\u001C`,
      );
      expect(messages).toStrictEqual([`${adt}\r`, oru]);
      expect(issues).toStrictEqual([
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAMING_REMOVED", "info", "\u001C"],
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAMING_REMOVED", "info", "\u001C"],
      ]);
    });

    it("accepts several messages in one frame and frames without a gap", () => {
      const [messages] = split(
        `${start}${adt}\r${oru}\r${end}${start}${adt}\r${end}`,
      );
      expect(messages).toStrictEqual([`${adt}\r`, `${oru}\r`, `${adt}\r`]);
    });

    it("accepts a frame with line feed terminators and whitespace between frames", () => {
      const [messages] = split(
        `${start}${adt}\nPID|1\n${end}\n\n${start}${oru}\n${end}\n`,
      );
      expect(messages).toStrictEqual([`${adt}\nPID|1\n`, `${oru}\n`]);
    });

    it("starts a new message at a start block inside a line", () => {
      const [messages] = split(`${start}${adt}\rPID|1${start}${oru}\r${end}`);
      expect(messages).toStrictEqual([`${adt}\rPID|1`, `${oru}\r`]);
    });

    it("reports a start block after a frame that was not closed", () => {
      const [messages, issues] = split(
        `${start}${adt}\r${start}${oru}\r${end}`,
      );
      expect(messages).toStrictEqual([`${adt}\r`, `${oru}\r`]);
      expect(issues).toStrictEqual([
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAME_UNTERMINATED", "warning", start],
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAMING_REMOVED", "info", end],
      ]);
    });

    it("keeps the message of a frame that ends with the input and reports it", () => {
      const [messages, issues] = split(`${start}${adt}\rPID|1\r`);
      expect(messages).toStrictEqual([`${adt}\rPID|1\r`]);
      expect(issues).toStrictEqual([
        ["MLLP_FRAMING_REMOVED", "info", start],
        ["MLLP_FRAME_UNTERMINATED", "warning", start],
      ]);
    });

    it("reports an end block without start block as removed framing", () => {
      const [messages, issues] = split(`${adt}\r${end}`);
      expect(messages).toStrictEqual([`${adt}\r`]);
      expect(issues).toStrictEqual([["MLLP_FRAMING_REMOVED", "info", end]]);
    });

    it("splits batches inside frames", () => {
      const input = `${start}FHS|^~\\&\rBHS|^~\\&\r${adt}\rBTS|1\rFTS|1\r${end}`;
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual([`${adt}\r`]);
      expect(issues.map(([code]) => code)).toStrictEqual([
        "MLLP_FRAMING_REMOVED",
        "MLLP_FRAMING_REMOVED",
      ]);
    });
  });

  describe("byte order mark", () => {
    it("removes and reports it", () => {
      const [messages, issues] = split(`${bom}${adt}\r${oru}`);
      expect(messages).toStrictEqual([`${adt}\r`, oru]);
      expect(issues).toStrictEqual([["BYTE_ORDER_MARK_REMOVED", "info", bom]]);
    });

    it("precedes a frame", () => {
      const [messages, issues] = split(`${bom}${start}${adt}\r${end}`);
      expect(messages).toStrictEqual([`${adt}\r`]);
      expect(issues.map(([code]) => code)).toStrictEqual([
        "BYTE_ORDER_MARK_REMOVED",
        "MLLP_FRAMING_REMOVED",
        "MLLP_FRAMING_REMOVED",
      ]);
    });
  });

  describe("content outside messages", () => {
    it("drops and reports segments before the first MSH", () => {
      const [messages, issues] = split(`PID|1\rNTE|2\r${adt}\r`);
      expect(messages).toStrictEqual([`${adt}\r`]);
      expect(issues).toStrictEqual([
        ["CONTENT_OUTSIDE_MESSAGE", "warning", "PID|1\rNTE|2"],
      ]);
    });

    it("keeps the dropped text in the value of the issue", () => {
      const { issues } = splitBatch(`garbage\r${adt}`);
      expect(issues[0]?.value).toBe("garbage");
      expect(issues[0]?.message).not.toContain("garbage");
    });

    it("reports separate runs separately", () => {
      const input = `junk 1\r${adt}\rBTS|1\rjunk 2\r\rjunk 3\rFTS|0\rjunk 4`;
      expect(split(input)).toStrictEqual([
        [`${adt}\r`],
        [
          ["CONTENT_OUTSIDE_MESSAGE", "warning", "junk 1"],
          ["CONTENT_OUTSIDE_MESSAGE", "warning", "junk 2\r\rjunk 3"],
          ["CONTENT_OUTSIDE_MESSAGE", "warning", "junk 4"],
        ],
      ]);
    });

    it("reports text between and after frames", () => {
      const input = `${start}${adt}\r${end}text between\r${start}${oru}\r${end}text after`;
      const [messages, issues] = split(input);
      expect(messages).toStrictEqual([`${adt}\r`, `${oru}\r`]);
      expect(
        issues.filter(([code]) => code === "CONTENT_OUTSIDE_MESSAGE"),
      ).toStrictEqual([
        ["CONTENT_OUTSIDE_MESSAGE", "warning", "text between"],
        ["CONTENT_OUTSIDE_MESSAGE", "warning", "text after"],
      ]);
    });

    it("returns no message for text without MSH", () => {
      const [messages, issues] = split("PID|1\rOBX|1");
      expect(messages).toStrictEqual([]);
      expect(issues).toStrictEqual([
        ["CONTENT_OUTSIDE_MESSAGE", "warning", "PID|1\rOBX|1"],
      ]);
    });

    it("reports a frame without content", () => {
      expect(split(`${start}${end}`)).toStrictEqual([
        [],
        [
          ["MLLP_FRAMING_REMOVED", "info", start],
          ["MLLP_FRAMING_REMOVED", "info", end],
        ],
      ]);
    });
  });

  describe("issues", () => {
    it("are listed in input order", () => {
      const input = `${bom}${start}${adt}\rBTS|9\r${start}${oru}\r${end}`;
      const { issues } = splitBatch(input);
      const starts = issues.map(({ location }) => location?.span.start ?? -1);
      expect(starts).toStrictEqual([...starts].sort((a, b) => a - b));
      expect(issues.map(({ code }) => code)).toStrictEqual([
        "BYTE_ORDER_MARK_REMOVED",
        "MLLP_FRAMING_REMOVED",
        "MLLP_FRAME_UNTERMINATED",
        "BATCH_COUNT_MISMATCH",
        "MLLP_FRAMING_REMOVED",
        "MLLP_FRAMING_REMOVED",
      ]);
    });
  });

  describe("samples/batch.hl7", () => {
    const input = readFileSync(
      new URL("../../../../samples/batch.hl7", import.meta.url),
      "utf8",
    );

    it("splits into the three messages without remarks", () => {
      const { messages, issues } = splitBatch(input);
      expect(issues).toStrictEqual([]);
      expect(
        messages.map((message) => {
          const result = parse(message);
          return result.ok && result.value.issues.length === 0
            ? result.value.message.segments.map(({ id }) => id).join(" ")
            : "unparsed";
        }),
      ).toStrictEqual([
        "MSH EVN PID PV1",
        "MSH EVN PID PV1",
        "MSH PID OBR OBX",
      ]);
      for (const message of messages) expect(message).toMatch(/^MSH\|/u);
      expect(messages.join("")).not.toMatch(/^(?:FHS|BHS|BTS|FTS)\|/mu);
    });
  });
});
