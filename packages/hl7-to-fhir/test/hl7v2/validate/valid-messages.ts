// Generates messages that conform to the shipped definitions: the segments follow the message structure, the fields
// stay within their segment definitions, and the values have the format and, where a shipped table applies, the codes
// of the data type. The generator reads the definitions the validator reads, so it states "this is valid" independently
// of the validator's rules.
import fc from "fast-check";

import { codeTables } from "../../../src/hl7v2/definitions/code-tables";
import { dataTypes } from "../../../src/hl7v2/definitions/data-types";
import { messageStructures } from "../../../src/hl7v2/definitions/message-structures";
import { segmentDefinitions } from "../../../src/hl7v2/definitions/segment-definitions";
import type {
  ComponentDefinition,
  FieldDefinition,
  StructureElement,
} from "../../../src/hl7v2/definitions/types";
import type { Hl7Message } from "../../../src/hl7v2/model";
import { parse } from "../../../src/hl7v2/parse";

const alphanumeric = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
);

const text = fc.string({
  unit: fc.constantFrom(...alphanumeric),
  minLength: 1,
  maxLength: 12,
});

const upperCode = fc.string({
  unit: fc.constantFrom(...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")),
  minLength: 1,
  maxLength: 6,
});

/** Digits, with the decimal point, sign and missing digits the NM format allows. */
const number = fc
  .tuple(
    fc.constantFrom("", "+", "-"),
    fc.nat({ max: 999_999 }),
    fc.option(fc.nat({ max: 9999 }), { nil: undefined }),
  )
  .map(
    ([sign, whole, fraction]) =>
      `${sign}${String(whole)}${fraction === undefined ? "" : `.${String(fraction)}`}`,
  );

const sequenceId = fc.nat({ max: 9999 }).map(String);

const date = fc.date({
  min: new Date(Date.UTC(1900, 0, 1)),
  max: new Date(Date.UTC(2099, 11, 31)),
  noInvalidDate: true,
});

/** The ISO form of a date, `YYYY-MM-DDTHH:MM:SS.mmm`, without punctuation. */
const digitsOfDate = date.map((value) =>
  value.toISOString().replaceAll(/\D/g, ""),
);

const offset = fc.constantFrom(
  "",
  "+0100",
  "-0500",
  "+0530",
  "+1400",
  "-1200",
  "+0000",
);

const precision = fc.constantFrom(4, 6, 8);

const dateValue = fc
  .tuple(digitsOfDate, precision)
  .map(([digits, length]) => digits.slice(0, length));

const dateTimeValue = fc
  .tuple(
    digitsOfDate,
    fc.constantFrom(4, 6, 8, 10, 12, 14),
    fc.constantFrom(0, 1, 2, 3),
    offset,
  )
  .map(([digits, length, fractionLength, zone]) => {
    // Only a time with seconds has a fraction; the date's milliseconds supply the digits for it.
    const fraction =
      length === 14 && fractionLength > 0
        ? `.${digits.slice(14, 14 + fractionLength)}`
        : "";
    return `${digits.slice(0, length)}${fraction}${zone}`;
  });

const timeValue = fc
  .tuple(digitsOfDate, fc.constantFrom(2, 4, 6), offset)
  .map(([digits, length, zone]) => `${digits.slice(8, 8 + length)}${zone}`);

/** A value of a code table: one of the codes of the shipped table, or a code of the format when no table is shipped. */
function codeValue(table: string | undefined): fc.Arbitrary<string> {
  const shipped = table === undefined ? undefined : codeTables.get(table);
  return shipped === undefined ? upperCode : fc.constantFrom(...shipped.codes);
}

/** The escape sequences of the delimiters `|^~\&`, which a code such as `L&I` of table 0203 needs. */
const escapes: Readonly<Record<string, string>> = {
  "|": "\\F\\",
  "^": "\\S\\",
  "~": "\\R\\",
  "\\": "\\E\\",
  "&": "\\T\\",
};

/** The text as it is written into a message: with an escape sequence for every delimiter in it. */
function escaped(value: string): string {
  return value.replaceAll(
    /[|^~\\&]/g,
    (character) => escapes[character] ?? character,
  );
}

/** A valid value of a primitive data type, from the table when one applies. */
function valueOf(
  dataType: string,
  table: string | undefined,
): fc.Arbitrary<string> {
  return unescapedValueOf(dataType, table).map(escaped);
}

function unescapedValueOf(
  dataType: string,
  table: string | undefined,
): fc.Arbitrary<string> {
  const shipped = table === undefined ? undefined : codeTables.get(table);
  if (shipped !== undefined) return codeValue(table);
  switch (dataType) {
    case "NM":
      return number;
    case "SI":
      return sequenceId;
    case "DT":
      return dateValue;
    case "DTM":
      return dateTimeValue;
    case "TM":
      return timeValue;
    case "ID":
    case "IS":
      return upperCode;
    default:
      return text;
  }
}

/** The primitive type that fits into a subcomponent: the first component's type, for a composite one. */
function primitiveOf(dataType: string): string {
  const definition = dataTypes.get(dataType);
  const first =
    definition?.kind === "composite" ? definition.components[0] : undefined;
  return first === undefined ? dataType : primitiveOf(first.dataType);
}

/** The table of a component: the enclosing table for the first one, the component's own for the others. */
function tableOf(
  index: number,
  enclosing: string | undefined,
  definition: ComponentDefinition,
): string | undefined {
  return index === 0 ? (enclosing ?? definition.table) : definition.table;
}

/** Joins the parts and leaves them out at random, but never the first one when the result must hold something. */
function parts(
  generators: readonly fc.Arbitrary<string>[],
  separator: string,
  populated: boolean,
): fc.Arbitrary<string> {
  const optional = generators.map((generator, index) =>
    populated && index === 0 ? generator : fc.option(generator, { nil: "" }),
  );
  return fc.tuple(...optional).map((values) => values.join(separator));
}

/** A component of a composite type: its subcomponents, or one value for a primitive component. */
function componentOf(
  dataType: string,
  table: string | undefined,
  populated: boolean,
): fc.Arbitrary<string> {
  const definition = dataTypes.get(dataType);
  if (definition?.kind !== "composite")
    return valueOf(primitiveOf(dataType), table);
  const subcomponents = definition.components.map((sub, index) =>
    valueOf(primitiveOf(sub.dataType), tableOf(index, table, sub)),
  );
  return parts(subcomponents, "&", populated);
}

/** One repetition of a field of the given type: its components. */
function repetitionOf(
  dataType: string,
  table: string | undefined,
  populated: boolean,
): fc.Arbitrary<string> {
  const definition = dataTypes.get(dataType);
  if (definition?.kind !== "composite") return valueOf(dataType, table);
  const components = definition.components.map((component, index) =>
    componentOf(
      component.dataType,
      tableOf(index, table, component),
      populated && index === 0,
    ),
  );
  return parts(components, "^", populated);
}

/** The repetitions of a field. */
function repetitionsOf(
  definition: FieldDefinition,
  dataType: string,
  populated: boolean,
): fc.Arbitrary<string> {
  const maximum =
    definition.maxRepetitions === "unbounded"
      ? 3
      : Math.min(definition.maxRepetitions, 3);
  return fc
    .array(repetitionOf(dataType, definition.table, populated), {
      minLength: 1,
      maxLength: maximum,
    })
    .map((repetitions) => repetitions.join("~"));
}

/** The value types a generated OBX-5 can have, which OBX-2 names. */
const observationTypes = ["NM", "ST", "SI", "DT", "TM", "TX", "FT", "TS", "CE"];

/**
 * Every field of a segment, from position 1, as the text between the field separators; a field that must not be used
 * or is skipped stays empty.
 */
function fieldsOf(
  id: string,
  skip: ReadonlySet<number> = new Set(),
): fc.Arbitrary<string[]> {
  const definition = segmentDefinitions.get(id);
  const generators = (definition?.fields ?? []).map((field) => {
    if (field.optionality === "X" || skip.has(field.position)) {
      return fc.constant("");
    }
    const required = field.optionality === "R";
    const generated = repetitionsOf(field, field.dataType, required);
    return required ? generated : fc.option(generated, { nil: "" });
  });
  return fc.tuple(...generators);
}

/** An OBX segment: OBX-5 has the type OBX-2 names. */
function observation(): fc.Arbitrary<string> {
  return fc.constantFrom(...observationTypes).chain((valueType) => {
    const value = repetitionsOf(
      {
        position: 5,
        name: "observationValue",
        dataType: valueType,
        optionality: "C",
        maxRepetitions: "unbounded",
      },
      valueType,
      true,
    );
    return fc
      .tuple(fieldsOf("OBX", new Set([2, 5])), value)
      .map(([fields, observed]) => {
        const all = [...fields];
        all[1] = valueType;
        all[4] = observed;
        return `OBX|${all.join("|")}`;
      });
  });
}

/** A segment of a given identifier: the generated fields for a defined segment, an identifier only otherwise. */
function segmentOf(id: string): fc.Arbitrary<string> {
  if (id === "OBX") return observation();
  return fieldsOf(id).map((fields) => `${id}|${fields.join("|")}`);
}

/** The identifiers of the segments the elements allow, in an order the structure allows. */
function sequenceOf(
  elements: readonly StructureElement[],
): fc.Arbitrary<string[]> {
  return fc.tuple(...elements.map(occurrencesOf)).map((lists) => lists.flat());
}

function occurrencesOf(element: StructureElement): fc.Arbitrary<string[]> {
  const maxLength = element.max === 1 ? 1 : 2;
  if (element.kind === "segment") {
    return fc
      .integer({ min: element.min, max: maxLength })
      .map((count) => Array.from({ length: count }, () => element.id));
  }
  return fc
    .array(sequenceOf(element.elements), { minLength: element.min, maxLength })
    .map((occurrences) => occurrences.flat());
}

/** The message type for a structure: with or without the structure in MSH-9.3. */
function messageTypeOf(structure: string): fc.Arbitrary<string> {
  const events =
    structure === "ADT_A01" ? ["A01", "A04", "A08", "A13"] : ["R01"];
  const code = structure.slice(0, structure.indexOf("_"));
  return fc
    .tuple(fc.constantFrom(...events), fc.boolean())
    .map(([event, withStructure]) =>
      withStructure ? `${code}^${event}^${structure}` : `${code}^${event}`,
    );
}

/** The header of a message: generated fields around the message type, processing ID and version. */
function header(structure: string): fc.Arbitrary<string> {
  return fc
    .tuple(
      fieldsOf("MSH", new Set([1, 2, 9, 11, 12])),
      messageTypeOf(structure),
      fc.constantFrom("2.5", "2.5.1"),
    )
    .map(([fields, messageType, version]) => {
      const all = [...fields];
      all[8] = messageType;
      all[10] = "P";
      all[11] = version;
      return `MSH|^~\\&|${all.slice(2).join("|")}`;
    });
}

/**
 * Messages of a shipped structure that conform to its definition: a header, then the segments the structure allows,
 * every field within its segment definition, every required field populated, and every value in its data type's
 * format and, where a shipped table applies, one of the table's codes.
 */
export function validMessage(
  structure: "ADT_A01" | "ORU_R01",
): fc.Arbitrary<Hl7Message> {
  const definition = messageStructures.get(structure);
  const elements = definition?.elements.slice(1) ?? [];
  return fc
    .tuple(
      header(structure),
      sequenceOf(elements).chain((ids) => fc.tuple(...ids.map(segmentOf))),
    )
    .map(([msh, segments]) => {
      const result = parse([msh, ...segments].join("\r"));
      if (!result.ok)
        throw new Error(`a generated message parses: ${result.error.code}`);
      return result.value.message;
    });
}
