# 0018. Deterministic ids and order

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (`src/fhir/ids.ts`, `src/fhir/messages/`, the FHIR golden files of
  `test/golden/fhir/`)

## Context

Every entry of a bundle needs a fullUrl, and references between entries use it. A `urn:uuid:` fullUrl is valid in
every bundle type and needs no server. Golden files, documentation and the playground need the same bundle for the
same message every time, while production data must never give two different resources the same id. The library runs
in browsers, Node and serverless runtimes, is compiled without DOM or Node types ([ADR 0002](0002-single-package-with-tooling-boundaries.md)),
and keeps no module state.

## Decision

**Ids are injected.** The `ids` option is an `IdGenerator`, `(index: number) => string`, called once per resource in
bundle order with the 0-based position of the resource. It returns a UUID; the fullUrl is `urn:uuid:<id>` and
resources carry no `id` of their own. `urn:uuid:` requires lowercase, so a UUID in upper case is lowered rather than
rejected: many UUID libraries and databases write upper case, and the case carries no meaning. A generator that
throws, returns no UUID or returns an id twice (in any case) fails the conversion with `HOOK_FAILED` (hook `ids`), and
the `TypeError` in `cause` names the rule, because a malformed or repeated fullUrl makes the bundle invalid.

The generator gets the position only. A scheme that needs more, such as the resource type or the segment, would want a
second parameter; adding one later keeps every generator written for one parameter working, so the signature stays
minimal until a use case asks for more.

**Random by default.** The default generator uses `crypto.randomUUID`, or builds a version 4 UUID from
`crypto.getRandomValues` where `randomUUID` is missing (pages served over plain HTTP). `globalThis.crypto` is typed at
the one place it is read, with a local interface, instead of an ambient declaration: the test configuration loads the
Node types, which declare `crypto` already, and a second global declaration would conflict.

**`sequentialIds(prefix)`.** Returns a generator that derives the id from the prefix (an FNV-1a hash as the first
group) and the position (the last group): `28eb34d2-0000-4000-8000-000000000001`. Passing the position makes the
generator stateless, so one converter made with it gives the same bundle for the same message on every call, and two
prefixes give different ids. It is documented for tests and documentation only.

**Stable order.** Entries follow the message: in ADT_A01 the Patient, the Encounter, then the Observations; in ORU_R01
per patient result the Patient and the Encounter, then per order the DiagnosticReport followed by its Observations.
Element order inside a resource follows the order of the FHIR R4 resource definition. Issues are sorted by their
position in the input. The ids are generated in the same order, so `sequentialIds` numbers resources as they appear.

## Alternatives considered

- **A stateful counter in `sequentialIds`.** Simpler, but a converter reused for a second message would continue the
  count, so the same message would give different bundles depending on what was converted before.
- **Resource ids derived from the content (hashes of identifiers).** Deterministic in production too, but two messages
  about the same patient would claim the same resource without the receiver deciding so; that is what conditional
  creates in transactions are for ([ADR 0017](0017-bundle-type-and-content.md)).
- **An ambient `declare var crypto`.** The plan's original idea; it conflicts with the Node and DOM declarations the
  tests and consumers load.

## Consequences

- Golden files and documentation are stable; production bundles have unique random ids.
- Callers can inject their own scheme (for example UUID v5 from their identifiers) without forking.
- A generator must return UUIDs, new for every resource; one that returns other text fails loudly instead of producing
  an invalid bundle.
