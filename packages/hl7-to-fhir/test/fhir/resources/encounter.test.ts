import type { Encounter } from "fhir/r4";
import { describe, expect, it } from "vitest";

import {
  encounterStatus,
  mapEncounter,
} from "../../../src/fhir/resources/encounter";
import type { IssueCode } from "../../../src/shared/issue";
import { codes } from "../helpers";
import { segment, segmentsMapping } from "./helpers";

const actCode = "http://terminology.hl7.org/CodeSystem/v3-ActCode";
const participation =
  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType";
const absent = {
  extension: [
    {
      url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
      valueCode: "unknown",
    },
  ],
};

/** Maps a PV1 with `fields` (and a PV2 with `pv2`, if given) and returns the Encounter with the issue codes. */
function encounter(
  fields: Readonly<Record<number, string>>,
  {
    event,
    pv2,
    subject,
  }: {
    event?: string | undefined;
    pv2?: Readonly<Record<number, string>>;
    subject?: string;
  } = {},
): { encounter: Encounter; codes: IssueCode[] } {
  const segments = [segment("PV1", fields)];
  if (pv2 !== undefined) segments.push(segment("PV2", pv2));
  const { context, at, issues } = segmentsMapping(segments, {
    settings: { identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" } },
  });
  const mapped = mapEncounter(
    context,
    at(1),
    pv2 === undefined ? undefined : at(2),
    { event, subject },
  );
  return { encounter: mapped, codes: codes(issues) };
}

describe("mapEncounter", () => {
  it("maps the fields of the guide's PV1 and PV2 rows", () => {
    expect(
      encounter(
        {
          2: "I",
          3: "4W^401^A^HOSP",
          4: "E",
          5: "PRE1^^^HOSP",
          6: "3E^301^B^HOSP",
          7: "0010^Everyman^Adam^^^Dr^^^HOSP",
          8: "0020^Everywoman^Eve^^^Dr^^^HOSP",
          9: "0030^Everyman^Abel^^^Dr^^^HOSP",
          17: "0040^Everywoman^Ada^^^Dr^^^HOSP",
          19: "V100^^^HOSP",
          44: "20240115080000+0100",
        },
        { pv2: { 3: "^Chest pain" }, subject: "urn:uuid:patient" },
      ),
    ).toStrictEqual({
      encounter: {
        resourceType: "Encounter",
        identifier: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                  code: "VN",
                },
              ],
            },
            system: "urn:oid:1.2.3.4.5",
            value: "V100",
          },
        ],
        status: "in-progress",
        class: { system: actCode, code: "IMP", display: "inpatient encounter" },
        type: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0007",
                code: "E",
              },
            ],
          },
        ],
        subject: { reference: "urn:uuid:patient" },
        participant: [
          participant("ATND", "attender", "0010", "Dr Adam Everyman"),
          participant("REF", "referrer", "0020", "Dr Eve Everywoman"),
          participant("CON", "consultant", "0030", "Dr Abel Everyman"),
          participant("ADM", "admitter", "0040", "Dr Ada Everywoman"),
        ],
        period: { start: "2024-01-15T08:00:00+01:00" },
        reasonCode: [{ text: "Chest pain" }],
        hospitalization: {
          preAdmissionIdentifier: {
            system: "urn:oid:1.2.3.4.5",
            value: "PRE1",
          },
        },
        location: [
          {
            location: { type: "Location", display: "4W, 401, A, HOSP" },
            status: "active",
          },
          {
            location: { type: "Location", display: "3E, 301, B, HOSP" },
            status: "completed",
          },
        ],
      },
      codes: [],
    });
  });

  it("keeps a visit number's own type", () => {
    expect(
      encounter({ 2: "I", 19: "V100^^^HOSP^AN" }).encounter.identifier?.[0]
        ?.type?.coding?.[0]?.code,
    ).toBe("AN");
  });

  it("plans the location of a pre-admission", () => {
    expect(
      encounter({ 2: "P", 3: "4W" }, { event: "A08" }).encounter,
    ).toMatchObject({
      status: "planned",
      location: [{ status: "planned" }],
    });
  });

  it("ends the period at the discharge date and finishes the encounter", () => {
    expect(
      encounter({
        2: "I",
        44: "20240115080000+0100",
        45: "20240117120000+0100",
      }).encounter,
    ).toMatchObject({
      status: "finished",
      period: {
        start: "2024-01-15T08:00:00+01:00",
        end: "2024-01-17T12:00:00+01:00",
      },
    });
  });

  it("finishes the encounter for a discharge date that is not valid", () => {
    expect(encounter({ 2: "I", 45: "20240230" })).toMatchObject({
      encounter: { status: "finished" },
      codes: ["INVALID_DATE_TIME"],
    });
  });

  describe("class", () => {
    it("is absent for a reason when PV1-2 is empty", () => {
      expect(encounter({ 1: "1" })).toStrictEqual({
        encounter: {
          resourceType: "Encounter",
          status: "unknown",
          class: absent,
        },
        codes: ["REQUIRED_ELEMENT_DEFAULTED"],
      });
    });

    it("is absent for a reason when the code is unknown", () => {
      expect(encounter({ 2: "Q" }, { event: "A08" })).toStrictEqual({
        encounter: {
          resourceType: "Encounter",
          status: "unknown",
          class: absent,
        },
        codes: ["UNMAPPED_CODE"],
      });
    });

    it("keeps a table 0004 coding where the guide maps no ActCode", () => {
      expect(encounter({ 2: "R" }).encounter.class).toStrictEqual({
        system: "http://terminology.hl7.org/CodeSystem/v2-0004",
        code: "R",
        display: "Recurring patient",
      });
    });
  });
});

describe("encounterStatus", () => {
  it.each([
    ["A13", "I", true, "in-progress"],
    ["A01", "I", true, "finished"],
    ["A08", "I", true, "finished"],
    [undefined, "O", true, "finished"],
    ["A01", "P", false, "in-progress"],
    ["A04", "O", false, "in-progress"],
    ["A08", "P", false, "planned"],
    ["A08", "E", false, "in-progress"],
    ["A08", "U", false, "unknown"],
    [undefined, "I", false, "in-progress"],
    [undefined, "Q", false, "unknown"],
    [undefined, undefined, false, "unknown"],
  ] as const)(
    "is %s for event %s, class %s and discharged %s: %s",
    (event, patientClass, discharged, status) => {
      expect(encounterStatus(event, patientClass, discharged)).toBe(status);
    },
  );
});

function participant(
  code: string,
  display: string,
  id: string,
  name: string,
): NonNullable<Encounter["participant"]>[number] {
  return {
    type: [{ coding: [{ system: participation, code, display }] }],
    individual: {
      type: "Practitioner",
      identifier: { system: "urn:oid:1.2.3.4.5", value: id },
      display: name,
    },
  };
}
