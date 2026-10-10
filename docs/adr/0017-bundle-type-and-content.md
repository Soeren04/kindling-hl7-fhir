# 0017. Bundle type and content

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (`src/fhir/bundle.ts`, `src/fhir/messages/`; the golden bundles of every sample are
  checked by the official FHIR validator in `validator.yml`)

## Context

A conversion returns one FHIR R4 Bundle per HL7 v2 message. FHIR offers several bundle types with different meaning
([Bundle.type](https://hl7.org/fhir/R4/bundle.html)): a `collection` is a set of resources without server semantics, a
`transaction` is executed by a server as one unit, a `message` starts with a MessageHeader and is processed by a
messaging endpoint. The guide maps every message to a message bundle with MessageHeader and Provenance resources, and
each segment to further resources (Account, Coverage, RelatedPerson, ServiceRequest, Specimen, PractitionerRole, ...).

Further forces: a transaction that POSTs a Patient for every message creates a duplicate patient per message on the
server; an update event (A08 update patient information, A13 cancel discharge) is about a patient and a visit the
receiver already has; v2.5.1 gives an order and its results no identifier that stays the same when a result is sent
again; and a message bundle needs `MessageHeader.source.endpoint`, which v2 does not carry reliably (MSH-3 and MSH-4
name an application and a facility, not an endpoint).

## Decision

**Bundle types.** `collection` is the default: plain data, which the caller stores, forwards or inspects. `transaction`
is opt-in (`bundleType: "transaction"`), and every entry has a `request`:

- Patient and Encounter are matched by the first identifier that has a system, `identifier=<system>|<value>`
  (URL-encoded, `|`, `,`, `$` and `\` escaped as the search syntax requires). For an update event (A08, A13) they are
  a conditional update, `PUT Patient?identifier=...`, which replaces the resource with the identifier or creates it.
  For any other event they are a conditional create, `POST` with `ifNoneExist`, so a registration or admission does
  not overwrite what the server learned since.
- A Patient or Encounter without such an identifier is created unconditionally and reported as
  `CONDITIONAL_REQUEST_UNAVAILABLE`, because a condition on a value without system would match identifiers of any
  assigning authority.
- DiagnosticReport and Observation are always a plain `POST`. Their placer and filler numbers identify the order, not
  one result, and v2.5.1 has no identifier for an observation, so a result message that is sent again, or a corrected
  one, creates the report and its observations again; the receiver deduplicates or supersedes them by its own rules.

`message` bundles are a stretch goal for the reason above.

**Bundle elements.** MSH-10 is `Bundle.identifier.value` and MSH-7 `Bundle.timestamp`, an instant, so it is left out
with `DATE_TIME_OFFSET_MISSING` when no offset is known ([ADR 0013](0013-dates-and-times.md)). Every entry has a
`urn:uuid:` fullUrl ([ADR 0018](0018-deterministic-ids-and-order.md)); references between resources use the fullUrl,
so every reference resolves inside the bundle, and logical references to practitioners and locations carry no
`reference` at all ([ADR 0014](0014-logical-references.md)). A message without resources gives a bundle without
`entry`, as FHIR JSON has no empty arrays.

**Content.** Four resources: Patient (PID), Encounter (PV1, PV2), Observation (OBX, with NTE as notes) and
DiagnosticReport (OBR, with ORC). Each mapper cites the guide's segment map and the rows it implements; a test checks
the citations against the guide's npm package. Of the guide's message maps, the rows that produce these four
resources are implemented and cited (`message-adt-a01-to-bundle`, `message-oru-r01-to-bundle`); MessageHeader,
Provenance and the other resources are not created. Every segment of the message that the conversion does not carry
into the bundle (EVN, NK1, AL1, DG1, IN1, a note of an order, a Z segment without a segment mapper, a segment the
structure does not allow at its place) is reported as `SEGMENT_NOT_MAPPED`, an info, once per segment identifier at
its first such occurrence: the caller learns what the bundle leaves out without one issue per repetition.

**Message structures.** The structure is resolved as `group` does it ([ADR 0011](0011-structures-groups-and-validation.md)):
ADT_A01, which table 0354 assigns to the events A01, A04, A08 and A13, and ORU_R01 are converted; every other
structure (ADT_A03, ACK, ORM_O01, an unknown or missing MSH-9) fails with `UNSUPPORTED_MESSAGE`, located at MSH-9 and
carrying the issues of parsing and validation. The trigger event decides as well: a structure named in MSH-9.3 does
not make another event convertible, so `ADT^A03^ADT_A01` fails at MSH-9.2, as does an ORU_R01 with another event
than R01. A failure is the honest answer: a bundle with only a Patient for an ADT^A03 would claim a conversion that
left out what the message is about (the discharge). Messages of other versions
than 2.5.x are converted with the 2.5.1 grouping, with the version note of validation.

**Walking the groups.** ADT_A01 has no groups for the mapped segments: the first PID, PV1 and PV2 and every OBX of the
top level are mapped. ORU_R01 is walked by `PATIENT_RESULT`: the Patient and Encounter of its `PATIENT` and `VISIT`
groups, then for each `ORDER_OBSERVATION` a DiagnosticReport whose results are the Observations of its `OBSERVATION`
and `SPECIMEN` groups, each linked to the Patient and Encounter of its own patient result. In bundle order a report
comes before its observations.

## Alternatives considered

- **`transaction` by default.** It is what a FHIR server wants, but it makes the converter decide how the receiver
  stores data; a collection can be turned into a transaction by the caller, the reverse loses nothing either way.
- **Plain POST in transactions.** One duplicate Patient per message.
- **PUT with a client-assigned id derived from the identifier.** Needs the receiver to accept client ids and couples
  ids across systems; conditional create and update are the FHIR mechanisms made for this.
- **Conditional create for update events too.** The server would keep the old Patient and Encounter, and an A08 or
  A13 would change nothing.
- **Conditional update for every event.** A late or resent admission would overwrite data the server received since.
- **Conditional requests for reports and observations, by placer or filler number.** The numbers identify the order;
  matching on them would replace the results of one observation with those of another of the same order.
- **Converting every ADT event with the ADT_A01 mapping.** ADT_A03 (discharge) and ADT_A02 (transfer) have their own
  structures and meaning; mapping them as an admission would be wrong. They are stretch goals.
- **Creating every resource of the guide's message maps.** Most need decisions only the receiver can make
  (Coverage, Account, Provenance policy); out of scope for 1.0.

## Consequences

- Collections validate without a server and contain no server instructions. Transactions do not duplicate patients or
  encounters that carry an identifier with a system, and an update event changes them; they do create reports and
  observations once per message, so a receiver that gets results again must deduplicate them itself.
- Callers who need other ADT events or ORM messages get a clear failure code instead of a partial bundle.
- The bundle has no MessageHeader, so routing information of MSH (sender, receiver) is only in `Conversion.message`.
