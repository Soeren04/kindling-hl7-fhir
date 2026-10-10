import type { Bundle } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { assembleBundle } from "../../src/fhir/bundle";
import type { MappedEntry } from "../../src/fhir/messages/mapping";
import type { MappedResource } from "../../src/fhir/options";
import type { IssueCode } from "../../src/shared/issue";
import { codes } from "./helpers";
import { segmentsMapping } from "./resources/helpers";

/**
 * Assembles a bundle of `resources`, each from the PID at index 1, for a message sent at `sent`, of the trigger event
 * `event`, a creating one when absent.
 */
function bundle(
  resources: readonly MappedResource[],
  type: "collection" | "transaction",
  {
    sent = "20240116091500+0100",
    event,
  }: { readonly sent?: string; readonly event?: string } = {},
): { bundle: Bundle; codes: IssueCode[] } {
  const { context, at, issues } = segmentsMapping(["PID|1"], { sent });
  const entries = resources.map((resource, index): MappedEntry => ({
    fullUrl: `urn:uuid:00000000-0000-4000-8000-00000000000${String(index)}`,
    resource,
    source: at(1),
  }));
  return {
    bundle: assembleBundle(context, at(0), entries, { type, event }),
    codes: codes(issues),
  };
}

const patient: MappedResource = {
  resourceType: "Patient",
  identifier: [
    { value: "LOCAL1" },
    { system: "urn:oid:1.2.3.4.5", value: "PATID1234" },
  ],
};
const observation: MappedResource = {
  resourceType: "Observation",
  status: "final",
  code: { text: "Cholesterol" },
};

describe("assembleBundle", () => {
  it("is a collection identified by MSH-10, at the time of MSH-7", () => {
    expect(bundle([patient, observation], "collection")).toStrictEqual({
      bundle: {
        resourceType: "Bundle",
        identifier: { value: "MSG00001" },
        type: "collection",
        timestamp: "2024-01-16T09:15:00+01:00",
        entry: [
          {
            fullUrl: "urn:uuid:00000000-0000-4000-8000-000000000000",
            resource: patient,
          },
          {
            fullUrl: "urn:uuid:00000000-0000-4000-8000-000000000001",
            resource: observation,
          },
        ],
      },
      codes: [],
    });
  });

  it("leaves out the timestamp without an offset, as an instant needs one", () => {
    expect(bundle([], "collection", { sent: "20240116091500" })).toStrictEqual({
      bundle: {
        resourceType: "Bundle",
        identifier: { value: "MSG00001" },
        type: "collection",
      },
      codes: ["DATE_TIME_OFFSET_MISSING"],
    });
  });

  it("has no identifier without MSH-10", () => {
    const { context, at } = segmentsMapping([]);
    const header = at(0);
    const withoutControlId = {
      ...header,
      segment: { ...header.segment, fields: header.segment.fields.slice(0, 9) },
    };
    expect(
      assembleBundle(context, withoutControlId, [], {
        type: "collection",
        event: undefined,
      }),
    ).toStrictEqual({
      resourceType: "Bundle",
      type: "collection",
      timestamp: "2024-01-15T10:30:00+01:00",
    });
  });

  it("has no entry array without resources, as FHIR allows no empty arrays", () => {
    expect(bundle([], "collection").bundle.entry).toBeUndefined();
  });

  describe("as a transaction", () => {
    it("creates the patient only if none has its first identifier with a system", () => {
      const { bundle: assembled, codes: found } = bundle(
        [patient, observation],
        "transaction",
      );
      expect(assembled.type).toBe("transaction");
      expect(assembled.entry?.map(({ request }) => request)).toStrictEqual([
        {
          method: "POST",
          url: "Patient",
          ifNoneExist: "identifier=urn%3Aoid%3A1.2.3.4.5|PATID1234",
        },
        { method: "POST", url: "Observation" },
      ]);
      expect(found).toStrictEqual([]);
    });

    it("escapes the characters the search syntax and URLs reserve", () => {
      const reserved: MappedResource = {
        resourceType: "Encounter",
        status: "finished",
        class: { code: "IMP" },
        identifier: [
          { system: "http://hospital.example/visits", value: "V|1,2$3\\4 5" },
        ],
      };
      expect(
        bundle([reserved], "transaction").bundle.entry?.[0]?.request
          ?.ifNoneExist,
      ).toBe(
        "identifier=http%3A%2F%2Fhospital.example%2Fvisits|V%5C%7C1%5C%2C2%5C%243%5C%5C4%205",
      );
    });

    it("creates a patient without an identifier with a system unconditionally, and says so", () => {
      const local: MappedResource = {
        resourceType: "Patient",
        identifier: [{ value: "LOCAL1" }],
      };
      const { bundle: assembled, codes: found } = bundle(
        [local],
        "transaction",
      );
      expect(assembled.entry?.[0]?.request).toStrictEqual({
        method: "POST",
        url: "Patient",
      });
      expect(found).toStrictEqual(["CONDITIONAL_REQUEST_UNAVAILABLE"]);
    });

    it.each(["A08", "A13"])(
      "updates the patient and the encounter of an update event (%s) by their identifier",
      (event) => {
        const encounter: MappedResource = {
          resourceType: "Encounter",
          status: "in-progress",
          class: { code: "IMP" },
          identifier: [{ system: "urn:oid:1.2.3.4.6", value: "V1" }],
        };
        const { bundle: assembled, codes: found } = bundle(
          [patient, encounter, observation],
          "transaction",
          { event },
        );
        expect(assembled.entry?.map(({ request }) => request)).toStrictEqual([
          {
            method: "PUT",
            url: "Patient?identifier=urn%3Aoid%3A1.2.3.4.5|PATID1234",
          },
          {
            method: "PUT",
            url: "Encounter?identifier=urn%3Aoid%3A1.2.3.4.6|V1",
          },
          { method: "POST", url: "Observation" },
        ]);
        expect(found).toStrictEqual([]);
      },
    );

    it("creates a patient of an update event without an identifier with a system unconditionally, and says so", () => {
      const { bundle: assembled, codes: found } = bundle(
        [{ resourceType: "Patient" }],
        "transaction",
        { event: "A08" },
      );
      expect(assembled.entry?.[0]?.request).toStrictEqual({
        method: "POST",
        url: "Patient",
      });
      expect(found).toStrictEqual(["CONDITIONAL_REQUEST_UNAVAILABLE"]);
    });
  });
});
