# 0015. The explicit null in FHIR output

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (the mapping context leaves out every `""` and reports `HL7_NULL_IGNORED` when asked;
  `convert` asks for `transaction` bundles)

## Context

HL7 v2 distinguishes an empty field ("not sent": keep what you have) from the explicit null `""` ("delete what you
have", HL7 v2.5.1 section 2.5.3). The parser keeps the difference ([ADR 0008](0008-message-model-and-indexing.md)).
FHIR has no value that means "delete": a resource is a snapshot, an element is either present or absent, and an
absent element in an update replaces the stored value with nothing, whether the sender meant "delete" or "unknown".

The library writes two kinds of bundle: a `collection` by default, which is data and expresses no change to a server,
and an opt-in `transaction`, whose entries a server executes as creates and updates.

## Decision

- **Every `""` is left out of the FHIR output**, like an empty value. A mapper never writes `""` into an element, and
  never writes a placeholder value or a `data-absent-reason` for it. The one `data-absent-reason` the mappers write
  has nothing to do with nulls: a telecommunication number with a value but no equipment type (XTN.3 empty, unknown
  or `""`) gets `_system` with the reason `unknown`, because FHIR's invariant cpt-2 requires a system for every value
  and the reason is the way FHIR says "a system exists but is unknown".
- **For `transaction` bundles, each `""` the mapping leaves out is reported** as `HL7_NULL_IGNORED` (info), located
  at the null: the user learns that the sender asked to delete a value and that the bundle does not say so. The flag
  is `reportNulls` in the mapping settings; the bundle builder sets it for `transaction` bundles.
- **For `collection` bundles nothing is reported**: a collection expresses no change, so no intent is lost.
- **Where a null is reported:** a value that is `""` as a whole is reported once, where the mapper reads it (the
  field repetition, the component, or the subcomponent), before the mapper looks at its parts; a null part of a value
  with other content is reported at that part. Only values the mapping reads are reported; a null in a field the
  library does not map is not.

## Alternatives considered

- **`data-absent-reason` with code `masked` or `unknown`.** It states why a value is absent, not that it should be
  removed; a receiver would store the extension as data.
- **JSON Patch or conditional updates per null.** Expresses deletion for one server's semantics, needs the stored
  resource's shape and cannot be checked by the FHIR validator for a bundle in isolation.
- **Failing the conversion.** Nulls are common (PID-8 `""` to clear a gender); a converter that rejects them is
  unusable.
- **Reporting for every bundle type.** Every message with a null would carry a note that tells collection users
  nothing.

## Consequences

- Output never contains a value the sender did not send, and FHIR consumers never see an HL7 null.
- Delete intents are lost in FHIR, by necessity; for transactions the issue list says where, so an integration can
  apply them by other means.
- Callers of `hl7-to-fhir/hl7v2` still see every null through `isNull` and the message tree.
