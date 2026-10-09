import { describe, expect, it } from "vitest";

import type { Hl7Message } from "../../../src/hl7v2/model";
import { validate } from "../../../src/hl7v2/validate";
import { parsed } from "../helpers";
import { adtWith } from "./messages";

/** A value of the wrong type, as plain JavaScript can pass it. */
function untyped(value: unknown): Hl7Message {
  return value as Hl7Message;
}

describe("validate on trees that are not messages", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "MSH|^~\\&|"],
    ["an object without segments", { delimiters: {} }],
    ["segments that are not an array", { segments: "PID" }],
    ["a version that is not a string", { segments: [], version: 2.5 }],
  ])("reports %s as an invalid tree", (_case, value) => {
    expect(validate(untyped(value))).toStrictEqual([
      expect.objectContaining({
        code: "INVALID_TREE",
        severity: "error",
        location: { span: { start: 0, end: 0 } },
      }),
    ]);
  });

  it("locates the first node of the wrong type", () => {
    const { message } = parsed(adtWith().join("\r"));
    const [msh, evn, pid, pv1] = message.segments;
    const broken = {
      ...pid,
      fields: pid?.fields.map((field, index) =>
        index === 4 ? { ...field, repetitions: [null] } : field,
      ),
    };
    const issues = validate(
      untyped({ ...message, segments: [msh, evn, broken, pv1] }),
    );
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "INVALID_TREE",
        location: {
          span: pid?.fields[4]?.span,
          segmentIndex: 2,
          segmentId: "PID",
          field: 5,
          repetition: 1,
        },
      }),
    ]);
  });

  it.each([
    ["no span", undefined],
    ["an unsafe span", { start: 0, end: 2 ** 53 }],
    ["a fractional span", { start: 0.5, end: 1 }],
    ["a reversed span", { start: 5, end: 4 }],
    ["a negative span", { start: -1, end: 4 }],
  ])("reports a segment with %s as an invalid tree", (_case, span) => {
    const { message } = parsed(adtWith().join("\r"));
    const [msh, evn, pid, pv1] = message.segments;
    const broken = { ...pid, span };
    const tree = untyped({ ...message, segments: [msh, evn, broken, pv1] });
    expect(validate(tree)).toStrictEqual([
      expect.objectContaining({
        code: "INVALID_TREE",
        location: { span: { start: 0, end: 0 }, segmentIndex: 2 },
      }),
    ]);
  });

  it("reports a field without span as an invalid tree, located by its segment", () => {
    const { message } = parsed(adtWith().join("\r"));
    const [msh, evn, pid, pv1] = message.segments;
    const broken = {
      ...pid,
      fields: pid?.fields.map((field, index) =>
        index === 4 ? { ...field, span: undefined } : field,
      ),
    };
    const tree = untyped({ ...message, segments: [msh, evn, broken, pv1] });
    expect(validate(tree)).toStrictEqual([
      expect.objectContaining({
        code: "INVALID_TREE",
        location: {
          span: pid?.span,
          segmentIndex: 2,
          segmentId: "PID",
          field: 5,
        },
      }),
    ]);
  });

  it("validates a tree whose delimiters or identifiers could not be written", () => {
    const { message } = parsed(adtWith().join("\r"));
    const [msh, evn, pid, pv1] = message.segments;
    const tree = {
      ...message,
      delimiters: { field: "a", component: "a", repetition: "a" },
      segments: [
        msh,
        evn,
        pid,
        pv1,
        { id: "Z|\r", fields: [], span: { start: 0, end: 0 } },
      ],
    };
    expect(validate(untyped(tree)).map(({ code }) => code)).toStrictEqual([
      "UNEXPECTED_SEGMENT",
    ]);
  });

  it("never puts tree content into the issue", () => {
    const [issue] = validate(untyped({ segments: [{ id: "Everyman" }] }));
    expect(issue?.message).not.toContain("Everyman");
    expect(issue).not.toHaveProperty("value");
  });
});
