import type { ContactPoint } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapXtn } from "../../../src/fhir/datatypes/xtn";
import type { Issue, IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

/** Maps PID-13 holding `value` and returns the contact point with the issues. */
function xtnWithIssues(value: string): {
  contact: ContactPoint | undefined;
  issues: Issue[];
} {
  const { context, field, issues } = mapping(`PID|1||||||||||||${value}`);
  return { contact: mapXtn(context, field(13)), issues };
}

/** Maps PID-13 holding `value` and returns the contact point with the codes of the issues. */
function xtn(value: string): {
  contact: ContactPoint | undefined;
  codes: IssueCode[];
} {
  const { contact, issues } = xtnWithIssues(value);
  return { contact, codes: codes(issues) };
}

const unknownSystem = {
  _system: {
    extension: [
      {
        url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
        valueCode: "unknown",
      },
    ],
  },
};

const email = "adam.everyman@example.org";

describe("mapXtn", () => {
  it.each<[string, ContactPoint | undefined, IssueCode[]]>([
    [
      "^PRN^PH^^1^555^5550123",
      { system: "phone", value: "+1 555 5550123", use: "home" },
      [],
    ],
    [
      "^WPN^PH^^^555^5550123^12",
      { system: "phone", value: "555 5550123 X12", use: "work" },
      [],
    ],
    ["^^FX^^^^5550123", { system: "fax", value: "5550123" }, []],
    [
      "^WPN^PH^^1^555^5550123^^^^^+15555550123",
      { system: "phone", value: "+15555550123", use: "work" },
      [],
    ],
    ["^^BP^^^^5550199", { system: "pager", value: "5550199" }, []],
    [
      "^^CP^^^555^5550123",
      { system: "phone", value: "555 5550123", use: "mobile" },
      [],
    ],
    [
      "^WPN^CP^^^555^5550123",
      { system: "phone", value: "555 5550123", use: "work" },
      [],
    ],
    // The email address: XTN.4, else the free text of XTN.1.
    [`^^Internet^${email}`, { system: "email", value: email }, []],
    [`^^^${email}`, { system: "email", value: email }, []],
    [`${email}^^Internet`, { system: "email", value: email }, []],
    [`${email}^NET^X.400`, { system: "email", value: email }, []],
    // No usable system: FHIR gets the data-absent-reason, and the unknown code is reported.
    ["(555)555-0123", { ...unknownSystem, value: "(555)555-0123" }, []],
    [
      "(555)555-0123^PRN",
      { ...unknownSystem, value: "(555)555-0123", use: "home" },
      [],
    ],
    [
      "^^XYZ^^^^5550123",
      { ...unknownSystem, value: "5550123" },
      ["UNMAPPED_CODE"],
    ],
    ['^^""^^^^5550123', { ...unknownSystem, value: "5550123" }, []],
    // Content that fits the system is mapped, content that does not is reported, never dropped silently.
    [
      `^^X.400^${email}^^555^5550123`,
      { system: "email", value: email },
      ["CONTACT_DETAIL_DROPPED"],
    ],
    [
      `^PRN^PH^${email}^^^5550123`,
      { system: "phone", value: "5550123", use: "home" },
      ["CONTACT_DETAIL_DROPPED"],
    ],
    ["^PRN^PH^a@b.c", undefined, ["CONTACT_DETAIL_DROPPED"]],
    ["^^Internet^^^555^5550123", undefined, ["CONTACT_DETAIL_DROPPED"]],
    ["^^Internet^^^^^^^^^5550123", undefined, ["CONTACT_DETAIL_DROPPED"]],
    [`^^XYZ^${email}`, undefined, ["UNMAPPED_CODE", "CONTACT_DETAIL_DROPPED"]],
    // Nothing to map.
    ["", undefined, []],
    ['""', undefined, []],
    ["^PRN^PH", undefined, []],
    ['""^""^""^""', undefined, []],
  ])("maps %j", (value, contact, issued) => {
    expect(xtn(value)).toStrictEqual({ contact, codes: issued });
  });

  it("maps the use codes the guide maps", () => {
    const uses = ["PRN", "WPN", "PRS"].map(
      (code) => xtn(`^${code}^PH^^^^5550123`).contact?.use,
    );
    expect(uses).toStrictEqual(["home", "work", "mobile"]);
  });

  it.each(["ORN", "VHN", "ASN", "EMR", "NET", "BPN"])(
    "leaves out the use %j, which the guide lists as unmatched, silently",
    (code) => {
      expect(xtn(`^${code}^MD^^^^5550123`)).toStrictEqual({
        contact: { system: "other", value: "5550123" },
        codes: [],
      });
    },
  );

  it.each(["QQQ", "prn", "__proto__", "constructor", "toString"])(
    "reports the unknown use %j and leaves it out",
    (code) => {
      const { contact, issues } = xtnWithIssues(`^${code}^PH^^^^5550123`);
      expect(contact).toStrictEqual({ system: "phone", value: "5550123" });
      expect(issues).toStrictEqual([
        expect.objectContaining({
          code: "UNMAPPED_CODE",
          value: code,
          location: expect.objectContaining({ component: 2 }) as unknown,
        }),
      ]);
    },
  );

  it.each(["hasOwnProperty", "__proto__", "valueOf"])(
    "reports the unknown equipment type %j",
    (code) => {
      expect(xtn(`^^${code}^^^^5550123`)).toStrictEqual({
        contact: { ...unknownSystem, value: "5550123" },
        codes: ["UNMAPPED_CODE"],
      });
    },
  );

  it("maps every equipment type the guide maps", () => {
    const systems = ["PH", "FX", "MD", "SAT", "BP", "TDD", "TTY"].map(
      (code) => xtn(`^^${code}^^^^5550123`).contact?.system,
    );
    expect(systems).toStrictEqual([
      "phone",
      "fax",
      "other",
      "other",
      "pager",
      "other",
      "other",
    ]);
  });

  it("locates the dropped part and names its text", () => {
    const { issues } = xtnWithIssues(`^^Internet^^^555^5550123^12`);
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "CONTACT_DETAIL_DROPPED",
        severity: "warning",
        value: "555",
        location: expect.objectContaining({
          field: 13,
          component: 6,
        }) as unknown,
      }),
    ]);
    const phone = xtnWithIssues(`^PRN^PH^${email}^^^5550123`).issues;
    expect(phone[0]).toMatchObject({
      value: email,
      location: { field: 13, component: 4 },
    });
  });

  it("maps every repetition of the field on its own", () => {
    const { context, field } = mapping(
      "PID|1||||||||||||^PRN^PH^^^^5550123~^WPN^FX^^^^5550199",
    );
    expect([
      mapXtn(context, field(13, 1)),
      mapXtn(context, field(13, 2)),
      mapXtn(context, field(13, 3)),
    ]).toStrictEqual([
      { system: "phone", value: "5550123", use: "home" },
      { system: "fax", value: "5550199", use: "work" },
      undefined,
    ]);
  });

  it("reports a null number once, at the number", () => {
    const { context, field, issues } = mapping('PID|1||||||||||||""', {
      settings: { reportNulls: true },
    });
    expect(mapXtn(context, field(13))).toBeUndefined();
    expect(
      issues.map(({ code, location }) => [code, location.component]),
    ).toStrictEqual([["HL7_NULL_IGNORED", undefined]]);
  });
});
