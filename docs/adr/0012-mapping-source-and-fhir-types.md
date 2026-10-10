# 0012. Mapping source and FHIR types

- Status: accepted
- Date: 2026-10-10
- Implementation: partial (the data type mappers in `src/fhir/datatypes/` cite the guide and a test checks every
  citation; the resource mappers of phase 3 follow)

## Context

Every FHIR element the library writes must come from a documented decision, not from the author's reading of HL7 v2.
HL7 publishes one: the [HL7 Version 2 to FHIR Implementation Guide](https://hl7.org/fhir/uv/v2mappings/STU1/)
(CC0-1.0, [ADR 0005](0005-hl7-content-licensing.md)), whose ConceptMaps map each v2 data type, segment and table to
FHIR R4. Three facts shape how the library can follow it:

- The guide is modeled on HL7 v2.9; the library's baseline is v2.5.1. Release 1.0.0 ships maps for CE and TS next to
  those for CWE and DTM, but 2.5.1 messages use the older types in other places than the guide expects, components the
  guide maps do not exist in 2.5.1 (CWE.10 to CWE.13, XTN.13 and later), and some types changed (PL.1 to PL.3 are
  IS, not HD).
- The guide sometimes leaves a choice to the implementer ("determine whether organization or system") or maps a v2
  value to a FHIR element that does not accept it (HD.1, a local namespace ID, as a URI).
- The public API returns FHIR resources, so its declarations must name FHIR types that consumers can resolve, also
  when their tsconfig sets `"types": []`, which hides global type packages.

## Decision

**One pinned release of the guide.** The mappings follow release 1.0.0 (STU 1), named once in
`src/fhir/mapping-guide.ts` (`mappingGuide`). The release was read from its npm package
`hl7.fhir.uv.v2mappings@1.0.0` (published on npm by `grahamegrieve`, who publishes the FHIR packages; its integrity
hash is recorded in the test fixture),
because hl7.org is not reachable from the development sandbox. The package cannot be a devDependency: its manifest
declares FHIR registry packages (`hl7.fhir.r4.core`) as npm dependencies, which npm cannot install.

**Every mapper cites its ConceptMap.** Each data type module exports a `MappingCitation`: the id of the guide's
ConceptMap (`datatype-cx-to-identifier`) and the source rows it implements (`CX.1`, `CX.4`, ...). Rows it leaves out
are not mapped, and the module comment says why. `test/fhir/datatypes/guide-maps.json` holds the source row ids of the
cited maps, extracted from the npm package; a test fails when a mapper cites a map or row the guide does not have, or
when the extract holds a map nothing cites. The resource mappers are to cite their segment maps the same way, so the
mapping table of the documentation can be generated from the citations.

**The 2.5.1 crosswalk.** One mapper serves two types of the guide, or a guide type and its 2.5.1 counterpart, where
one is a prefix of the other. The guide has a map for each of CE, CWE, TS and DTM, and the mapper cites the ones it
follows:

| Guide (v2.9)                                     | v2.5.1                 | Rule                                                           |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------------------- |
| CWE, and a map for CE                            | CE, CWE (9 components) | `mapCwe` reads CE as the first six components of CWE.          |
| DTM, and a map for TS                            | TS                     | `mapTs` reads the first part, which is TS.1 or the DTM itself. |
| HD in PL.1 to PL.3                               | IS                     | Read as text.                                                  |
| SNM in XTN.5 to 8                                | NM                     | Read as text, as the guide assembles the number from text.     |
| CWE in XAD.9                                     | IS                     | Read as text (`Address.district`).                             |
| XPN.15, XTN.13 to 18, XAD.15 to 23, CWE.10 to 13 | absent                 | Not cited and not read.                                        |

The table of a 2.5.1 component comes from the HL7 definitions in `src/hl7v2/definitions/data-types.ts`, which record
the same crosswalk for validation.

**Where the guide is not followed, the mapper says so.**

- HD.1 is a key of the `identifierSystems` option, not a URI (it is local text such as `HOSP`). The guide takes HD.2
  only when HD.1 is not valued; here the option is consulted first, by HD.1 and then by HD.2, because the caller
  knows the URI the receiver uses for an authority, and only then does the universal ID give the system by its type
  (ISO as `urn:oid:`, UUID as `urn:uuid:`, URI as itself).
- ED.2 and ED.3 together spell the MIME type, because table 0291 codes are not MIME types; an ED.3 that is a MIME
  type already is used as written.
- XTN.1, the deprecated free-text number, serves as the email address when XTN.4 is empty for an email.
- XCN and PL become logical references instead of resources ([ADR 0014](0014-logical-references.md)).

**Codes without a FHIR equivalent.** One rule serves every concept-map lookup. A code the guide lists as unmatched
(table 0201 `NET`, table 0190 `L`, ...) is left out without an issue: the guide decided it, and nothing in the
message is wrong. Any other code the lookup does not know (a typo, a site-specific code) is reported as
`UNMAPPED_CODE`. The terminology module keeps the unmatched codes of each map in a set beside it so that the mappers
can tell the two apart. A name that is given but does not resolve (an assigning authority not in `identifierSystems`,
a coding system with no URI) is reported as well, but a missing name is not: a sender that sends no authority or
coding system gave nothing that could be wrong.

**FHIR types from `@types/fhir`, as a dependency.** Sources import FHIR types only as `import type { ... } from
"fhir/r4"`, the module form of `@types/fhir` (DefinitelyTyped, generated from FHIR 4.0.1), never the `fhir4` global
namespace, which `"types": []` hides. `@types/fhir` is an exact-pinned entry of `dependencies`, not of
`devDependencies`: the published declarations will reference `fhir/r4`, so it must install with the package for
consumers' type checks to resolve it. It contains no JavaScript, so the package keeps zero runtime dependencies, and
`verbatimModuleSyntax` makes every import of it type-only. `test/consumer/` is a strict consumer project with
`"types": []`: a unit test compiles it against the sources, and the Consumer job of CI against the packed tarball
with the repository's TypeScript version. dependency-cruiser cannot resolve a declaration-only module, so its rules
name `fhir/r4` as the one unresolved import the FHIR layer may use; the hl7v2 layer may not, and a fixture proves it.

## Alternatives considered

- **Mapping from the HL7 v2 standard directly.** No citable source per element, and the standard's text may not be
  copied ([ADR 0005](0005-hl7-content-licensing.md)).
- **The latest CI build of the guide.** It changes without notice; a release can be cited.
- **A copy of the ConceptMaps as runtime data.** The mappers implement each row in code anyway; the full maps would
  ship megabytes nobody reads. The test fixture keeps only the row ids.
- **Own FHIR type definitions.** Hundreds of interfaces to maintain, and consumers would have two incompatible
  `Bundle` types. `@types/fhir` is what FHIR users in TypeScript already have.
- **`@types/fhir` as a peer dependency.** Consumers would have to install it by hand to compile, for types they never
  chose; a missing peer shows up as an error in our declarations.
- **The `fhir4` global namespace.** Unavailable to consumers with `"types": []`.

## Consequences

- Every element is traceable to a row of a released guide, and a mistyped citation fails a test.
- A new guide release is adopted deliberately: update `mappingGuide`, re-extract the fixture, review the mappers whose
  rows changed.
- `@types/fhir` updates reach consumers with our releases; Renovate proposes them like any dependency, and the API
  report shows when a FHIR type the API names changes. Its 3.0.x releases date from 2020 and sort above the current
  0.0.x line, so Renovate is told to stay below 1.0.
- `npm ls --prod` lists one package, so the package description says "no runtime dependencies" instead of "zero
  dependencies".
