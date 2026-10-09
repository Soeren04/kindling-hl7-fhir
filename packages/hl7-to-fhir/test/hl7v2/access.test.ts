import { describe, expect, it } from "vitest";

import { get, getAll, isNull } from "../../src/hl7v2/access";
import { parsed } from "./helpers";

const message = parsed(
  [
    "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20240115103000||ADT^A01^ADT_A01|MSG00001|P|2.5.1",
    'PID|1||111^^^HOSP^MR~222^^^HOSP^PI||Everyman^Adam^Q&Quincy||19800101|M||||||||||||""',
    "NTE|1||first note",
    "OBX|1|NM|A^Alpha||5",
    "OBX|2|TX|B^Beta||line\\.br\\two~second",
    "OBX|3|ST|C^Gamma||",
    "NTE|2||second note",
    'OBX|4|ST|D^Delta||""~x',
    "ZPI|1||a&&c^&b",
  ].join("\r"),
).message;

describe("get", () => {
  it.each([
    ["a field", "PID.8", "M"],
    ["a component", "PID.5.2", "Adam"],
    [
      "a field with components, which reads its first component",
      "PID.5",
      "Everyman",
    ],
    ["the first subcomponent of a component", "PID.5.3", "Q"],
    ["a subcomponent", "PID.5.3.2", "Quincy"],
    ["the first repetition", "PID.3.1", "111"],
    [
      "the first repetition of a component with several subcomponents",
      "PID.5.3.1",
      "Q",
    ],
    ["an indexed repetition", "PID.3[2].1", "222"],
    ["a component of an indexed repetition", "PID.3[2].5", "PI"],
    ["the first segment of an identifier", "OBX.3.1", "A"],
    ["an indexed segment", "OBX[2].3.2", "Beta"],
    [
      "a segment index counted over the whole message",
      "NTE[2].3",
      "second note",
    ],
    ["a segment after others of its kind", "OBX[4].5[2]", "x"],
    ["decoded text", "OBX[2].5", "line\ntwo"],
    ["the field separator", "MSH.1", "|"],
    ["the encoding characters", "MSH.2", "^~\\&"],
    ["a component of MSH-9", "MSH.9.2", "A01"],
    ["a field after MSH-2", "MSH.3", "LAB"],
    ["the version", "MSH.12", "2.5.1"],
    ["an empty subcomponent followed by a value", "ZPI.3.2.2", "b"],
    ["a custom segment", "ZPI.3", "a"],
  ])("reads %s", (_description, path, expected) => {
    expect(get(message, path)).toBe(expected);
  });

  it.each([
    ["an empty field", "OBX[3].5"],
    ["the explicit null", "PID.20"],
    ["a null in the first repetition", "OBX[4].5"],
    ["an empty subcomponent", "ZPI.3.1.2"],
    ["an empty component", "ZPI.3.2.1"],
    ["a field beyond the last", "PID.40"],
    ["a component beyond the last", "PID.8.2"],
    ["a subcomponent beyond the last", "PID.5.1.2"],
    ["a repetition beyond the last", "PID.3[3].1"],
    ["a segment beyond the last", "OBX[5].1"],
    ["a segment index of the wrong identifier", "PID[2].1"],
    ["a segment the message lacks", "PV1.2"],
    ["a malformed path", "PID..5"],
    ["an empty path", ""],
    ["a segment without field", "PID"],
    ["a lower-case path", "pid.5"],
  ])("returns undefined for %s", (_description, path) => {
    expect(get(message, path)).toBeUndefined();
  });

  it("reads the first segment even when its position is empty and a later one has a value", () => {
    const sparse = parsed("MSH|^~\\&|A\rOBX|1\rOBX|2|TX|B").message;
    expect(get(sparse, "OBX.3")).toBeUndefined();
    expect(get(sparse, "OBX[2].3")).toBe("B");
  });

  it("does not throw on hostile paths", () => {
    for (const path of [
      "__proto__.1",
      "PID.constructor",
      "PID.1e3",
      "PID.[",
      "\u0000",
    ]) {
      expect(get(message, path)).toBeUndefined();
    }
  });
});

describe("getAll", () => {
  it.each([
    ["every repetition of a field", "PID.3.1", ["111", "222"]],
    ["one component of every repetition", "PID.3.5", ["MR", "PI"]],
    ["one repetition", "PID.3[2].1", ["222"]],
    ["the same field of every segment", "OBX.3.1", ["A", "B", "C", "D"]],
    [
      "only the values, in order, skipping empty and null positions",
      "OBX.5",
      ["5", "line\ntwo", "second", "x"],
    ],
    ["one segment", "OBX[2].5", ["line\ntwo", "second"]],
    ["one repetition of one segment", "OBX[2].5[2]", ["second"]],
    [
      "a field that is the same in different segments",
      "NTE.3",
      ["first note", "second note"],
    ],
    ["the encoding characters", "MSH.2", ["^~\\&"]],
  ])("collects %s", (_description, path, expected) => {
    expect(getAll(message, path)).toStrictEqual(expected);
  });

  it.each([
    ["a missing segment", "PV1.2"],
    ["a missing field", "PID.40"],
    ["a segment beyond the last", "OBX[9].1"],
    ["a repetition beyond the last", "PID.3[9].1"],
    ["an empty field", "OBX[3].5"],
    ["a malformed path", "PID..5"],
    ["an empty path", ""],
  ])("returns an empty list for %s", (_description, path) => {
    expect(getAll(message, path)).toStrictEqual([]);
  });

  it("starts with the value get returns whenever there is one", () => {
    for (const path of ["PID.3.1", "OBX.5", "OBX.3.1", "NTE.3", "MSH.9.2"]) {
      expect(getAll(message, path)[0]).toBe(get(message, path));
    }
  });
});

describe("isNull", () => {
  it.each([
    ["a field that is the explicit null", "PID.20"],
    ["a null repetition", "OBX[4].5[1]"],
    ["a null reached through the first component", "OBX[4].5"],
  ])("is true for %s", (_description, path) => {
    expect(isNull(message, path)).toBe(true);
  });

  it.each([
    ["a value", "PID.8"],
    ["a repetition after a null", "OBX[4].5[2]"],
    ["an empty field", "OBX[3].5"],
    ["a field beyond the last", "PID.40"],
    ["a missing segment", "PV1.1"],
    ["a malformed path", "PID.x"],
  ])("is false for %s", (_description, path) => {
    expect(isNull(message, path)).toBe(false);
  });

  describe("for a position that is only partly null", () => {
    const partial = parsed(
      'MSH|^~\\&|LAB\rPID|1||""&x~""||""^Adam\rZPI|""^\rZPJ|""&',
    ).message;

    it.each([
      [
        "a field whose first component is null and second is a value",
        "PID.5",
        false,
      ],
      ["the null first component of that field", "PID.5.1", true],
      ["the value component of that field", "PID.5.2", false],
      [
        "a repetition whose component has a null and a value subcomponent",
        "PID.3",
        false,
      ],
      ["that component", "PID.3.1", false],
      ["its null subcomponent", "PID.3.1.1", true],
      ["its value subcomponent", "PID.3.1.2", false],
      ["a later repetition that is the null", "PID.3[2]", true],
      ["a field whose trailing empty component parse trims", "ZPI.1", true],
      [
        "a component whose trailing empty subcomponent parse trims",
        "ZPJ.1.1",
        true,
      ],
    ])("answers for %s (%s): %s", (_description, path, expected) => {
      expect(isNull(partial, path)).toBe(expected);
    });
  });

  it("tells the explicit null from the absence that get reports alike", () => {
    expect(get(message, "PID.20")).toBeUndefined();
    expect(get(message, "OBX[3].5")).toBeUndefined();
    expect(isNull(message, "PID.20")).toBe(true);
    expect(isNull(message, "OBX[3].5")).toBe(false);
  });
});

describe("segment lookup", () => {
  /** The message with a segment after the first `PID` that throws when it is read. */
  function withTrap(): typeof message {
    const segments = [...message.segments];
    Object.defineProperty(segments, 2, {
      get() {
        throw new Error("read past the segment that was asked for");
      },
    });
    return { ...message, segments };
  }

  it("stops get and isNull at the segment they read", () => {
    expect(get(withTrap(), "PID.5.1")).toBe("Everyman");
    expect(isNull(withTrap(), "PID.20")).toBe(true);
    expect(get(withTrap(), "MSH[1].9.1")).toBe("ADT");
  });
});

describe("paths that are not strings", () => {
  it("match nothing instead of throwing", () => {
    const path = undefined as unknown as string;
    expect(get(message, path)).toBeUndefined();
    expect(getAll(message, path)).toStrictEqual([]);
    expect(isNull(message, path)).toBe(false);
  });
});
