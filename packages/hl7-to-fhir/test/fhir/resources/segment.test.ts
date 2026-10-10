import { describe, expect, it } from "vitest";

import {
  field,
  fieldLocation,
  isValued,
  segmentLocation,
} from "../../../src/fhir/resources/segment";
import { parsed } from "../../hl7v2/helpers";

const { message } = parsed('MSH|^~\\&|LAB|HOSP\rPID|1||12345||""\rzz1|1');
const at = (segmentIndex: number) => {
  const segment = message.segments[segmentIndex];
  if (segment === undefined) expect.fail("expected a segment");
  return { segment, segmentIndex };
};

describe("segmentLocation", () => {
  it("locates the whole segment", () => {
    expect(segmentLocation(at(1))).toStrictEqual({
      span: at(1).segment.span,
      segmentIndex: 1,
      segmentId: "PID",
    });
  });

  it("leaves out an identifier that is not valid, as locations carry no content", () => {
    expect(segmentLocation(at(2))).toStrictEqual({
      span: at(2).segment.span,
      segmentIndex: 2,
    });
  });
});

describe("fieldLocation", () => {
  it("locates a field that is there", () => {
    expect(fieldLocation(at(1), 3)).toMatchObject({
      span: at(1).segment.fields[2]?.span,
      field: 3,
    });
  });

  it("locates an absent field by the empty span at the end of the segment", () => {
    const { end } = at(1).segment.span;
    expect(fieldLocation(at(1), 11)).toStrictEqual({
      span: { start: end, end },
      segmentIndex: 1,
      segmentId: "PID",
      field: 11,
    });
  });
});

describe("isValued", () => {
  it.each([
    [3, true],
    [5, false],
    [2, false],
    [30, false],
  ])("tells whether PID-%i holds text: %s", (n, valued) => {
    expect(isValued(field(at(1), n))).toBe(valued);
  });
});
