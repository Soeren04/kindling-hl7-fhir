# 0014. Practitioners and locations as logical references

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (`mapXcn` in `src/fhir/datatypes/xcn.ts` and `mapPl` in `pl.ts`, used by the Encounter
  for its participants and locations and by the Observation for its performers)

## Context

HL7 v2 names people (XCN: ordering provider, attending doctor, responsible observer) and places (PL: the patient's
bed, room and ward) inline, in every message that mentions them. The guide maps an XCN to a Practitioner resource
(`datatype-xcn-to-practitioner`) and a PL to a hierarchy of up to six Location resources, bed within room within point
of care within floor within building within facility (`datatype-pl-to-location`).

Creating those resources raises questions that a message cannot answer: which Practitioner in the receiving server
is "Dr Adam Everyman, 0010 assigned by HOSP"; whether two messages that name the same bed mean the same Location
resource; and which of the guide's six levels a receiver models. Wrong answers duplicate records on the server. FHIR
R4 has an answer built in: a [logical reference](https://hl7.org/fhir/R4/references.html#logical), a `Reference` that
carries an `identifier` (and a `display`) instead of a `reference` URL, which the receiver resolves against its own
records.

## Decision

- **XCN becomes `Reference(Practitioner)`** with `type: "Practitioner"`, an `identifier` from the ID number (XCN.1),
  its assigning authority (XCN.9, resolved to the system like CX.4) and its type (XCN.13, table 0203), and a `display`
  of the name in speaking order (prefix, given names, family name, suffixes: `Dr Adam A Everyman III`). An XCN without
  ID number becomes a reference with a display only.
- **PL becomes `Reference(Location)`** with `type: "Location"`, an `identifier` from the comprehensive location
  identifier (PL.10, an EI) when it is sent, and a `display`: the location description (PL.9), or else the parts in
  PL component order, joined by commas, with the facility (PL.4) last: point of care, room, bed, building, floor and
  facility (`4W, 401, A, Main, 3, HOSP`).
- **No resources are created** for practitioners or locations in 1.0, and no reference points into the bundle.
  Practitioner and Location resources with conditional references are a stretch goal, which can be added as an option
  without changing the default.
- The citations name the rows of the guide's maps that the reference carries; the module comments state the
  deviation.

## Alternatives considered

- **Resources per the guide.** One Practitioner per XCN and up to six Locations per PL in every bundle, without a
  way to recognize them across messages; with `transaction` bundles, duplicates on the server unless every one gets
  a conditional create on an identifier that PL usually lacks.
- **Display only.** Loses the identifier, the only part a receiver can resolve.
- **Contained resources.** Contained resources may not be referenced from outside their container and cannot be
  shared between the Encounter and the Observations that name the same doctor.

## Consequences

- Bundles stay small and need no deduplication across messages; references validate without targets in the bundle.
- A receiver must resolve logical references itself (FHIR servers do not do it on create); a display-only reference
  carries no machine-readable link.
- A check that every reference resolves inside the bundle follows only references with a `reference` URL; logical
  references are outside its scope by design.
