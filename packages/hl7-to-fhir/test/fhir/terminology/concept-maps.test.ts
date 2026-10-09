import { describe, expect, it } from "vitest";

import {
  addressType,
  addressUnmatched,
  addressTypeMap,
  addressUse,
  addressUseMap,
  administrativeGender,
  administrativeGenderMap,
  diagnosticReportStatus,
  diagnosticReportStatusMap,
  diagnosticReportStatusUnmatched,
  encounterClass,
  encounterClassMap,
  nameUse,
  nameUseMap,
  nameUseUnmatched,
  observationStatus,
  observationStatusMap,
  observationStatusUnmatched,
  telecomEquipmentUse,
  telecomEquipmentUseMap,
  telecomSystem,
  telecomSystemMap,
  telecomUse,
  telecomUseMap,
  telecomUseUnmatched,
} from "../../../src/fhir/terminology/concept-maps";

const hostileKeys = [
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "prototype",
];

/** Every lookup function with the map behind it, to run the checks all lookups share. */
const lookups: readonly (readonly [
  string,
  (code: string) => unknown,
  ReadonlyMap<string, unknown>,
])[] = [
  ["administrativeGender", administrativeGender, administrativeGenderMap],
  ["encounterClass", encounterClass, encounterClassMap],
  ["observationStatus", observationStatus, observationStatusMap],
  ["diagnosticReportStatus", diagnosticReportStatus, diagnosticReportStatusMap],
  ["nameUse", nameUse, nameUseMap],
  ["addressUse", addressUse, addressUseMap],
  ["addressType", addressType, addressTypeMap],
  ["telecomUse", telecomUse, telecomUseMap],
  ["telecomSystem", telecomSystem, telecomSystemMap],
  ["telecomEquipmentUse", telecomEquipmentUse, telecomEquipmentUseMap],
];

describe.each(lookups)("%s", (_name, lookup, map) => {
  it.each(hostileKeys)(
    "returns undefined for the object property name %j",
    (key) => {
      expect(lookup(key)).toBeUndefined();
    },
  );

  it("returns undefined for the empty string and for padded codes", () => {
    expect(lookup("")).toBeUndefined();
    for (const code of map.keys()) {
      expect(lookup(` ${code}`)).toBeUndefined();
      expect(lookup(`${code} `)).toBeUndefined();
    }
  });

  it("is case-sensitive", () => {
    for (const code of map.keys()) {
      const swapped =
        code === code.toLowerCase() ? code.toUpperCase() : code.toLowerCase();
      if (!map.has(swapped)) expect(lookup(swapped)).toBeUndefined();
    }
  });

  it("agrees with its map for every code", () => {
    for (const [code, target] of map) {
      expect(lookup(code)).toStrictEqual(target);
    }
  });
});

describe("administrativeGender", () => {
  it.each([
    ["F", "female"],
    ["M", "male"],
    ["O", "other"],
    ["U", "unknown"],
    ["A", "other"],
    ["N", "other"],
  ])("maps %s to %s", (code, gender) => {
    expect(administrativeGender(code)).toBe(gender);
  });

  it("holds exactly the six codes of the IG", () => {
    expect([...administrativeGenderMap.keys()]).toStrictEqual([
      "F",
      "M",
      "O",
      "U",
      "A",
      "N",
    ]);
  });

  it.each(["X", "f", "m", "T"])("does not map %j", (code) => {
    expect(administrativeGender(code)).toBeUndefined();
  });
});

describe("encounterClass", () => {
  const actCode = "http://terminology.hl7.org/CodeSystem/v3-ActCode";
  const table0004 = "http://terminology.hl7.org/CodeSystem/v2-0004";

  it.each([
    ["E", actCode, "EMER", "emergency"],
    ["I", actCode, "IMP", "inpatient encounter"],
    ["O", actCode, "AMB", "ambulatory"],
    ["P", actCode, "PRENC", "pre-admission"],
    ["R", table0004, "R", "Recurring patient"],
    ["B", table0004, "B", "Obstetrics"],
    ["C", table0004, "C", "Commercial Account"],
    ["N", table0004, "N", "Not Applicable"],
    ["U", table0004, "U", "Unknown"],
  ])("maps %s to %s %s", (code, system, target, display) => {
    expect(encounterClass(code)).toStrictEqual({
      system,
      code: target,
      display,
    });
  });

  it("holds exactly the nine codes of the IG", () => {
    expect([...encounterClassMap.keys()]).toStrictEqual([
      "E",
      "I",
      "O",
      "P",
      "R",
      "B",
      "C",
      "N",
      "U",
    ]);
  });

  it.each(["X", "e", "Z"])("does not map %j", (code) => {
    expect(encounterClass(code)).toBeUndefined();
  });
});

describe("observationStatus", () => {
  it.each([
    ["A", "amended"],
    ["C", "corrected"],
    ["D", "entered-in-error"],
    ["F", "final"],
    ["P", "preliminary"],
    ["X", "cancelled"],
    ["W", "entered-in-error"],
  ])("maps %s to %s", (code, status) => {
    expect(observationStatus(code)).toBe(status);
  });

  it("holds exactly the seven codes the IG matches", () => {
    expect([...observationStatusMap.keys()].sort()).toStrictEqual([
      "A",
      "C",
      "D",
      "F",
      "P",
      "W",
      "X",
    ]);
  });

  it.each(["B", "I", "N", "O", "R", "S", "U", "V", "Z"])(
    "does not map %s, which the IG leaves unmatched",
    (code) => {
      expect(observationStatus(code)).toBeUndefined();
    },
  );
});

describe("diagnosticReportStatus", () => {
  it.each([
    ["O", "registered"],
    ["I", "registered"],
    ["S", "registered"],
    ["P", "preliminary"],
    ["C", "corrected"],
    ["R", "partial"],
    ["F", "final"],
    ["X", "cancelled"],
  ])("maps %s to %s", (code, status) => {
    expect(diagnosticReportStatus(code)).toBe(status);
  });

  it("holds exactly the eight codes the IG matches", () => {
    expect([...diagnosticReportStatusMap.keys()].sort()).toStrictEqual([
      "C",
      "F",
      "I",
      "O",
      "P",
      "R",
      "S",
      "X",
    ]);
  });

  it.each(["A", "M", "N", "Y", "Z"])(
    "does not map %s, which the IG leaves unmatched",
    (code) => {
      expect(diagnosticReportStatus(code)).toBeUndefined();
    },
  );
});

describe("nameUse", () => {
  it.each([
    ["BAD", "old"],
    ["D", "usual"],
    ["L", "official"],
    ["M", "maiden"],
    ["MSK", "anonymous"],
    ["N", "nickname"],
    ["NAV", "temp"],
    ["R", "official"],
    ["TEMP", "temp"],
  ])("maps %s to %s", (code, use) => {
    expect(nameUse(code)).toBe(use);
  });

  it("holds exactly the nine codes the IG matches", () => {
    expect(nameUseMap.size).toBe(9);
  });

  it.each([
    "A",
    "B",
    "C",
    "F",
    "I",
    "K",
    "NB",
    "NOUSE",
    "P",
    "REL",
    "S",
    "T",
    "U",
  ])("does not map %s, which the IG leaves unmatched", (code) => {
    expect(nameUse(code)).toBeUndefined();
  });
});

describe("addressUse and addressType", () => {
  it.each([
    ["BA", "old"],
    ["BI", "billing"],
    ["C", "temp"],
    ["B", "work"],
    ["H", "home"],
    ["O", "work"],
  ])("maps %s to the use %s", (code, use) => {
    expect(addressUse(code)).toBe(use);
  });

  it.each([
    ["M", "postal"],
    ["SH", "postal"],
  ])("maps %s to the type %s", (code, type) => {
    expect(addressType(code)).toBe(type);
  });

  it("keeps uses and types apart, as the IG does", () => {
    expect(addressUse("M")).toBeUndefined();
    expect(addressUse("SH")).toBeUndefined();
    expect(addressType("H")).toBeUndefined();
    expect(addressType("BA")).toBeUndefined();
    expect(addressUseMap.size).toBe(6);
    expect(addressTypeMap.size).toBe(2);
  });

  it.each(["N", "BDL", "F", "L", "P", "RH", "BR", "S", "TM", "V"])(
    "maps %s to neither, as the IG leaves it unmatched",
    (code) => {
      expect(addressUse(code)).toBeUndefined();
      expect(addressType(code)).toBeUndefined();
    },
  );
});

describe("telecomUse", () => {
  it.each([
    ["PRN", "home"],
    ["WPN", "work"],
    ["PRS", "mobile"],
  ])("maps %s to %s", (code, use) => {
    expect(telecomUse(code)).toBe(use);
  });

  it.each(["ORN", "VHN", "ASN", "EMR", "NET", "BPN"])(
    "does not map %s, which the IG leaves unmatched",
    (code) => {
      expect(telecomUse(code)).toBeUndefined();
    },
  );
});

describe("telecomSystem and telecomEquipmentUse", () => {
  it.each([
    ["PH", "phone"],
    ["FX", "fax"],
    ["MD", "other"],
    ["SAT", "other"],
    ["BP", "pager"],
    ["Internet", "email"],
    ["X.400", "email"],
    ["TDD", "other"],
    ["TTY", "other"],
  ])("maps %s to the system %s", (code, system) => {
    expect(telecomSystem(code)).toBe(system);
    expect(telecomEquipmentUse(code)).toBeUndefined();
  });

  it("maps CP to a mobile use and to no system", () => {
    expect(telecomEquipmentUse("CP")).toBe("mobile");
    expect(telecomSystem("CP")).toBeUndefined();
  });

  it("matches the dotted code X.400 literally", () => {
    expect(telecomSystem("X400")).toBeUndefined();
    expect(telecomSystem("XA400")).toBeUndefined();
  });

  it("is case-sensitive for Internet", () => {
    expect(telecomSystem("INTERNET")).toBeUndefined();
    expect(telecomSystem("internet")).toBeUndefined();
  });
});

describe("the codes the guide lists as unmatched", () => {
  const unmatchedSets: readonly (readonly [
    string,
    ReadonlySet<string>,
    readonly ReadonlyMap<string, unknown>[],
    readonly string[],
  ])[] = [
    [
      "observationStatusUnmatched",
      observationStatusUnmatched,
      [observationStatusMap],
      ["B", "I", "N", "O", "R", "S", "U", "V"],
    ],
    [
      "diagnosticReportStatusUnmatched",
      diagnosticReportStatusUnmatched,
      [diagnosticReportStatusMap],
      ["A", "M", "N", "Y", "Z"],
    ],
    [
      "nameUseUnmatched",
      nameUseUnmatched,
      [nameUseMap],
      ["A", "B", "C", "F", "I", "K", "NB", "NOUSE", "P", "REL", "S", "T", "U"],
    ],
    [
      "addressUnmatched",
      addressUnmatched,
      [addressUseMap, addressTypeMap],
      ["N", "BDL", "F", "L", "P", "RH", "BR", "S", "TM", "V"],
    ],
    [
      "telecomUseUnmatched",
      telecomUseUnmatched,
      [telecomUseMap],
      ["ORN", "VHN", "ASN", "EMR", "NET", "BPN"],
    ],
  ];

  it.each(unmatchedSets)(
    "%s lists the codes of the guide and none that the maps map",
    (_name, unmatched, maps, codes) => {
      expect([...unmatched].sort()).toStrictEqual([...codes].sort());
      for (const map of maps) {
        for (const code of unmatched) expect(map.has(code)).toBe(false);
      }
    },
  );

  it.each(hostileKeys)("does not hold the object property name %j", (key) => {
    for (const [, unmatched] of unmatchedSets) {
      expect(unmatched.has(key)).toBe(false);
    }
  });
});
