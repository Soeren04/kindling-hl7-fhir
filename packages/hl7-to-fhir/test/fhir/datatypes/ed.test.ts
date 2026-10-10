import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import type { Attachment } from "fhir/r4";
import { describe, expect, it } from "vitest";

import {
  canonicalBase64,
  decodeHex,
  encodeBase64,
  encodeUtf8,
} from "../../../src/fhir/datatypes/base64";
import { mapEd } from "../../../src/fhir/datatypes/ed";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

/** Maps OBX-5 holding `value` as an ED. */
function ed(value: string): {
  attachment: Attachment | undefined;
  codes: IssueCode[];
} {
  const { context, field, issues } = mapping(`OBX|1|ED|||${value}`);
  return { attachment: mapEd(context, field(5)), codes: codes(issues) };
}

describe("mapEd", () => {
  it.each<[string, Attachment | undefined]>([
    [
      "LAB^AP^PDF^Base64^JVBERi0xLjQK",
      { contentType: "application/pdf", data: "JVBERi0xLjQK" },
    ],
    [
      "LAB^IM^JPEG^Hex^FFD8FFE0",
      { contentType: "image/jpeg", data: "/9j/4A==" },
    ],
    ["LAB^TEXT^plain^A^Héllo", { contentType: "text/plain", data: "SMOpbGxv" }],
    [
      "LAB^application^Octet-stream^Base64^AAEC",
      { contentType: "application/octet-stream", data: "AAEC" },
    ],
    [
      "LAB^AP^PDF^Base64^JVBE\\.br\\Ri0x\\.br\\LjQK",
      { contentType: "application/pdf", data: "JVBERi0xLjQK" },
    ],
    // An unpadded Base64 text gets its padding.
    ["LAB^AP^PDF^Base64^AAE", { contentType: "application/pdf", data: "AAE=" }],
    [
      "LAB^AP^PDF^Base64^JVBERg",
      { contentType: "application/pdf", data: "JVBERg==" },
    ],
    // ED.3 that is a MIME type already is used as written, in lower case, whatever ED.2 says.
    [
      "LAB^AP^application/pdf^Base64^AAEC",
      { contentType: "application/pdf", data: "AAEC" },
    ],
    ["LAB^^Image/PNG^Base64^AAEC", { contentType: "image/png", data: "AAEC" }],
    [
      "LAB^TEXT^multipart/mixed^A^x",
      { contentType: "multipart/mixed", data: "eA==" },
    ],
    [
      "LAB^multipart^mixed^A^x",
      { contentType: "multipart/mixed", data: "eA==" },
    ],
    [
      "LAB^AP^application/vnd.ms-excel^Base64^AAEC",
      { contentType: "application/vnd.ms-excel", data: "AAEC" },
    ],
    ["LAB^AP^PDF^Base64", undefined],
    ["", undefined],
    ['""', undefined],
  ])("maps %j", (value, attachment) => {
    expect(ed(value)).toStrictEqual({ attachment, codes: [] });
  });

  it.each([
    ["LAB^SD^TIFF^Base64^AAEC", "SD", 2],
    ["LAB^^PDF^Base64^AAEC", undefined, 2],
    ["LAB^AP^^Base64^AAEC", undefined, 3],
    ["LAB^AP^p d f^Base64^AAEC", "p d f", 3],
    ["LAB^AP^foo/bar/baz^Base64^AAEC", "foo/bar/baz", 3],
    ["LAB^AP^unknown/pdf^Base64^AAEC", "unknown/pdf", 3],
    ["LAB^AP^application/^Base64^AAEC", "application/", 3],
  ])(
    "uses application/octet-stream and reports %j",
    (value, issueValue, component) => {
      const { context, field, issues } = mapping(`OBX|1|ED|||${value}`);
      expect(mapEd(context, field(5))).toStrictEqual({
        contentType: "application/octet-stream",
        data: "AAEC",
      });
      expect(codes(issues)).toStrictEqual(["UNMAPPED_CODE"]);
      expect(issues[0]?.value).toBe(issueValue);
      expect(issues[0]?.location.component).toBe(component);
    },
  );

  it.each([
    ["LAB^AP^PDF^Base64^not base64!", undefined, 5],
    ["LAB^AP^PDF^Base64^A", undefined, 5],
    ["LAB^AP^PDF^Base64^AB=C", undefined, 5],
    ["LAB^AP^PDF^Hex^ABC", undefined, 5],
    ["LAB^AP^PDF^Hex^GG", undefined, 5],
    ["LAB^AP^PDF^UU^AAEC", "UU", 4],
  ])("leaves out %j and reports it", (value, issueValue, component) => {
    const { context, field, issues } = mapping(`OBX|1|ED|||${value}`);
    expect(mapEd(context, field(5))).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["INVALID_ENCAPSULATED_DATA"]);
    expect(issues[0]?.value).toBe(issueValue);
    expect(issues[0]?.location.component).toBe(component);
  });

  it.each(["Hex", "Base64"])(
    "maps %s data of whitespace only to nothing, without an issue",
    (encoding) => {
      expect(ed(`LAB^AP^PDF^${encoding}^ \\.br\\ `)).toStrictEqual({
        attachment: undefined,
        codes: [],
      });
    },
  );

  it("keeps text data of whitespace only, which is data", () => {
    expect(ed("LAB^TEXT^plain^A^ ").attachment).toStrictEqual({
      contentType: "text/plain",
      data: "IA==",
    });
  });

  it("reports data without an encoding at the ED", () => {
    const { context, field, issues } = mapping("OBX|1|ED|||LAB^AP^PDF^^AAEC");
    expect(mapEd(context, field(5))).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["INVALID_ENCAPSULATED_DATA"]);
    expect(issues[0]).not.toHaveProperty("value");
  });
});

describe("base64", () => {
  propertyTest.prop([fc.uint8Array({ maxLength: 64 })])(
    "encodes bytes as Node does",
    (bytes) => {
      const encoded = encodeBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
      expect(canonicalBase64(encoded)).toBe(encoded);
    },
  );

  propertyTest.prop([fc.uint8Array({ maxLength: 64 })])(
    "pads Base64 text that was written without padding",
    (bytes) => {
      const padded = Buffer.from(bytes).toString("base64");
      const unpadded = padded.replaceAll("=", "");
      expect(canonicalBase64(unpadded)).toBe(padded);
    },
  );

  propertyTest.prop([fc.string({ unit: "binary", maxLength: 32 })])(
    "encodes text as UTF-8 as TextEncoder does",
    (text) => {
      expect(encodeUtf8(text)).toStrictEqual(new TextEncoder().encode(text));
    },
  );

  propertyTest.prop([fc.uint8Array({ maxLength: 32 })])(
    "decodes hexadecimal text of any case",
    (bytes) => {
      const hex = Buffer.from(bytes).toString("hex");
      expect(decodeHex(hex)).toStrictEqual(bytes);
      expect(decodeHex(hex.toUpperCase())).toStrictEqual(bytes);
    },
  );

  it("writes a lone surrogate as U+FFFD, as TextEncoder does", () => {
    expect(encodeUtf8("a\ud800b")).toStrictEqual(
      Uint8Array.from([0x61, 0xef, 0xbf, 0xbd, 0x62]),
    );
  });

  it.each(["A", "AB=", "A===", "AB==C", "AB*D", "AB=C", "A=", "ABCDE"])(
    "rejects %j",
    (text) => {
      expect(canonicalBase64(text)).toBeUndefined();
    },
  );

  it.each([
    ["AB", "AB=="],
    ["ABC", "ABC="],
    ["ABCD", "ABCD"],
    ["ABC=", "ABC="],
    ["", ""],
  ])("reads %j as %j", (text, canonical) => {
    expect(canonicalBase64(text)).toBe(canonical);
  });
});
