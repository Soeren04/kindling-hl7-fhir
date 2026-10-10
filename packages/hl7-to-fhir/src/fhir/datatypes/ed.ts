// ED (encapsulated data) to Attachment.
//
// The content type is the MIME type the type of data (ED.2, table 0191) and the data subtype (ED.3) spell together:
// `AP^PDF` is `application/pdf`, `IM^JPEG` `image/jpeg`. The guide maps ED.3 to the content type, but table 0291 codes
// such as `PDF` are no MIME types by themselves; a sender that writes the whole MIME type into ED.3 (`application/pdf`)
// is taken at its word, in lower case, whatever ED.2 says. FHIR requires a content type for data, so a pair that
// spells none becomes `application/octet-stream` and is reported.
//
// The data (ED.5) is converted to Base64 by its encoding (ED.4, table 0299): `Base64` is kept (without the whitespace
// line breaks put in it, and padded if the sender left the padding out), `Hex` decoded, and `A` (text) encoded as
// UTF-8, the encoding of the decoded value.
import type { Attachment } from "fhir/r4";

import { err, ok, type Result } from "../../shared/result";
import { type MappingContext, present, reportIssue, text } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { canonicalBase64, decodeHex, encodeBase64, encodeUtf8 } from "./base64";

/** The guide's map for ED; ED.2 serves the content type instead of an extension. */
export const edCitation: MappingCitation = {
  conceptMap: "datatype-ed-to-attachment",
  rows: ["ED.2", "ED.3", "ED.5"],
};

/** The MIME top-level type of the table 0191 types of data that have one. */
const topLevelTypes: ReadonlyMap<string, string> = new Map([
  ["AP", "application"],
  ["AU", "audio"],
  ["IM", "image"],
  ["TEXT", "text"],
  ["multipart", "multipart"],
]);

/** The top-level types of MIME (RFC 2046 and its registry), which ED.2 may also spell out. */
const mimeTypes = new Set([
  "application",
  "audio",
  "font",
  "image",
  "message",
  "model",
  "multipart",
  "text",
  "video",
]);

/** A MIME subtype: an RFC 6838 restricted name. */
const subtypeName = /^[\da-z][\w!#$&+.^-]{0,126}$/iu;

const fallbackContentType = "application/octet-stream";

/** Maps an ED to an Attachment; `undefined` when it has no data or the data cannot be decoded. */
export function mapEd(
  context: MappingContext,
  source: Source | undefined,
): Attachment | undefined {
  const ed = present(context, source);
  if (ed === undefined) return undefined;
  const [type, subtype, encodingSource, dataSource] = [2, 3, 4, 5].map((n) =>
    part(ed, n),
  );
  const data = text(context, dataSource);
  // Components are positional, so a value with data (ED.5) has the components before it, if only empty ones.
  if (
    type === undefined ||
    subtype === undefined ||
    encodingSource === undefined ||
    dataSource === undefined ||
    data === undefined
  ) {
    return undefined;
  }
  const encoding = text(context, encodingSource);
  const encoded = toBase64(encoding, data);
  if (!encoded.ok) {
    if (encoded.error === "no data") return undefined;
    const unknown = encoded.error === "unknown encoding";
    reportIssue(
      context,
      "INVALID_ENCAPSULATED_DATA",
      (unknown ? encodingSource : dataSource).location,
      unknown ? encoding : undefined,
    );
    return undefined;
  }
  return {
    contentType: contentType(context, type, subtype),
    data: encoded.value,
  };
}

/**
 * The data as Base64 by its encoding. Hexadecimal and Base64 data of whitespace only has no data, where text
 * (`A`) of whitespace is text.
 */
function toBase64(
  encoding: string | undefined,
  data: string,
): Result<string, "unknown encoding" | "malformed data" | "no data"> {
  const compacted = data.replaceAll(/\s/gu, "");
  if (compacted === "" && (encoding === "Hex" || encoding === "Base64")) {
    return err("no data");
  }
  if (encoding === undefined) return err("unknown encoding");
  switch (encoding) {
    case "A":
      return ok(encodeBase64(encodeUtf8(data)));
    case "Hex": {
      const bytes = decodeHex(compacted);
      return bytes === undefined
        ? err("malformed data")
        : ok(encodeBase64(bytes));
    }
    case "Base64": {
      const canonical = canonicalBase64(compacted);
      return canonical === undefined ? err("malformed data") : ok(canonical);
    }
    default:
      return err("unknown encoding");
  }
}

/** The MIME type of ED.2 and ED.3, by the rules at the top of this module. */
function contentType(
  context: MappingContext,
  typeSource: Source,
  subtypeSource: Source,
): string {
  const subtype = text(context, subtypeSource);
  if (subtype !== undefined && isMimeType(subtype)) {
    return subtype.toLowerCase();
  }
  const type = text(context, typeSource);
  const topLevel =
    type === undefined
      ? undefined
      : (topLevelTypes.get(type) ??
        (mimeTypes.has(type.toLowerCase()) ? type.toLowerCase() : undefined));
  if (topLevel === undefined) {
    reportIssue(context, "UNMAPPED_CODE", typeSource.location, type);
    return fallbackContentType;
  }
  if (subtype === undefined || !subtypeName.test(subtype)) {
    reportIssue(context, "UNMAPPED_CODE", subtypeSource.location, subtype);
    return fallbackContentType;
  }
  return `${topLevel}/${subtype.toLowerCase()}`;
}

/** Whether the text is a MIME type of a registered top-level type, `type/subtype` without parameters. */
function isMimeType(value: string): boolean {
  const [topLevel = "", subtype = "", ...rest] = value.split("/");
  return (
    rest.length === 0 &&
    mimeTypes.has(topLevel.toLowerCase()) &&
    subtypeName.test(subtype)
  );
}
