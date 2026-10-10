import { describe, expect, it } from "vitest";

import { createMappingContext } from "../../../src/fhir/context";
import { joinedLines, joinedText } from "../../../src/fhir/resources/text";
import { fieldValues, part } from "../../../src/fhir/source";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../../hl7v2/helpers";
import { settingsOf } from "../helpers";

/** The repetitions of NTE-3 in a message with the encoding characters `encoding`, and a context that reports nulls. */
function nte(value: string, encoding = "^~\\&") {
  const { message } = parsed(
    `MSH|${encoding}|LAB|HOSP|||20240115103000+0100||ORU^R01|1|P|2.5.1\rNTE|1||${value}`,
  );
  const segment = message.segments[1];
  if (segment === undefined) expect.fail("expected an NTE");
  const issues: Issue[] = [];
  const context = createMappingContext(
    message,
    settingsOf({ reportNulls: true }),
    issues,
  );
  const { component, subcomponent } = message.delimiters;
  return {
    sources: fieldValues(segment, 1, 3),
    context,
    issues,
    delimiters: { component, subcomponent },
  };
}

describe("joinedText", () => {
  it("joins components and subcomponents back with their separators", () => {
    const { sources, context, delimiters } = nte("a&b^c^^d");
    expect(joinedText(context, sources[0], delimiters)).toBe("a&b^c^^d");
  });

  it("joins nothing in a message without a subcomponent separator", () => {
    const { sources, context, delimiters } = nte("a&b^c", "^~");
    expect(delimiters.subcomponent).toBeUndefined();
    expect(joinedText(context, sources[0], delimiters)).toBe("a&b^c");
  });

  it("reads a component as plain text", () => {
    const { sources, context, delimiters } = nte("a&b^c");
    expect(joinedText(context, part(sources[0], 2), delimiters)).toBe("c");
  });

  it("is undefined for an empty or absent value, and reports a null once", () => {
    const { sources, context, delimiters, issues } = nte('""');
    expect(joinedText(context, sources[0], delimiters)).toBeUndefined();
    expect(joinedText(context, undefined, delimiters)).toBeUndefined();
    expect(issues.map(({ code }) => code)).toStrictEqual(["HL7_NULL_IGNORED"]);
    const empty = nte("^");
    expect(
      joinedText(empty.context, empty.sources[0], empty.delimiters),
    ).toBeUndefined();
  });
});

describe("joinedLines", () => {
  it("makes each repetition a line and skips empty ones", () => {
    const { sources, context, delimiters } = nte("one~~two");
    expect(joinedLines(context, sources, delimiters)).toBe("one\ntwo");
  });

  it("is undefined without text", () => {
    const { context, delimiters } = nte("");
    expect(joinedLines(context, [], delimiters)).toBeUndefined();
  });
});
