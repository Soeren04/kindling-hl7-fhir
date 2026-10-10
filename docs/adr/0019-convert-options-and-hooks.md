# 0019. `convert`, its options and hooks

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (`src/fhir/convert.ts`, `options.ts`, `hooks.ts`, `ids.ts`; exported from `src/index.ts`)

## Context

`convert(input, options?)` is the main function of the package: it parses, validates, groups and maps one message.
Users extend it without forking: their Z segments, local code and identifier systems, their own tweaks of the
resources. Options are often built from configuration files, so keys come from outside the code (`__proto__`,
`constructor`), and hooks are code the library does not control. [ADR 0004](0004-result-and-issues.md) promises that
expected failures are returned and that a throwing hook does not escape; [ADR 0010](0010-public-result-and-failure-shapes.md)
fixes the shape of failures.

## Decision

**API.** `convert(input, options?)` returns `Result<Conversion, ConvertFailure>`; `createConverter(options?)` returns
a `Converter`, `(input) => Result<Conversion, ConvertFailure>`, that checks and normalizes the options once.
`convert(input, options)` is `createConverter(options)(input)`. `ConvertFailureCode` is derived from the failure,
`ConvertFailure["code"]`, so the two cannot drift apart. `Conversion` is `{ bundle, message, issues }`;
`bundle` is a `Bundle<MappedResource>` (`fhir/r4` types), so `entry[n].resource` narrows by `resourceType`.

**Issues.** A conversion reports the issues of `parse`, of `validate` (with the caller's segment definitions) and of
the mapping in one list, sorted by position. An issue found twice (the same code at the same span, as an invalid date
that validation and mapping both see) is listed once; the list is capped at 10,000 plus `TOO_MANY_ISSUES`. Validation
always runs: the issues of a message are what a caller needs to judge its bundle, and `validate` takes time linear in
the message.

**Failures.** `ConvertFailure` is discriminated by `code` and has `code`, `message` (no message content) and `issues`
(the issues found until the failure) like every failure, plus one locator per code:

| Code                  | When                                                                                                                           | Locator                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `PARSE_FAILED`        | `parse` fails (not a string, no MSH, unusable delimiters)                                                                      | the last issue says why        |
| `UNSUPPORTED_MESSAGE` | the structure is not ADT_A01 or ORU_R01, or the trigger event not one of its own ([ADR 0017](0017-bundle-type-and-content.md)) | `location` (MSH-9, or MSH-9.2) |
| `INVALID_OPTIONS`     | an option has the wrong type or value                                                                                          | `option` (`customize.Foo`)     |
| `HOOK_FAILED`         | a hook throws, returns something other than it must or is asynchronous                                                         | `hook`, `location` and `cause` |

`PARSE_FAILED` wraps every parse failure code instead of repeating them: callers of `convert` decide on "not HL7 v2"
as a whole, and the parse code is the code of the last issue. `HOOK_FAILED` carries two locators, the hook
(`segmentMappers.ZPI`, `customize.Patient`, `ids`) and the segment it was called for, because both are needed to find
the cause; `cause` is what the hook threw (or a `TypeError` saying what it returned) and may contain message content,
so it is not part of `message`.

**Options.** `segments` (segment definitions from `defineSegment`, used by validation and grouping),
`segmentMappers`, `customize`, `codeSystems`, `identifierSystems`, `ids`, `timezone` and `bundleType`. Every optional
property is `?: T | undefined`. `createConverter` checks them all and reports the first invalid one as
`INVALID_OPTIONS`: an unknown option name, a timezone that is not a FHIR offset, a segment mapper keyed by something
other than a segment identifier, a customizer of a resource type the library does not create, a non-string system.
Every record (`segmentMappers`, `customize`, `codeSystems`, `identifierSystems`) must be a plain object, an object
literal, `JSON.parse` output or `Object.create(null)`: a `Map`, an array or a class instance is rejected, because its
entries are not own enumerable properties and would be lost without a word. Every record becomes a `Map` of its own
enumerable properties, read once, so later changes to the record have no effect and `__proto__`, `constructor` or
`toString` are ordinary keys; a segment mapper or customizer under such a key is rejected because it is no segment
identifier or resource type. The mapping settings (`codeSystems`, `identifierSystems`, `timezone` and whether nulls
are reported) are made by `createMappingSettings` of the data type layer, the one place that validates the timezone.

**Hooks.** They run after the built-in mapping, in a fixed order: the segment mappers, once per segment with their
identifier in message order, then the customizers, once per resource of their type in bundle order. A segment mapper
runs for every segment with its identifier, also for segments the library maps itself (a `PID` mapper can change the
Patient of its PID). It changes resources through `context.extend(type, update)`, which replaces the last resource of
the type mapped from a segment before the mapped one (a ZPI after the PID of the second patient extends that
patient), else the first of the type. When the bundle has none of the type, nothing changes and the warning
`EXTENSION_TARGET_MISSING` says so, located at the mapped segment: the mapper is not wrong, but its effect is lost. A
type the conversion does not create is a mistake in the mapper and fails with `HOOK_FAILED`.

Every call of a hook goes through one guard (`runHook`): a throw, or a result that is not a resource of the type the
hook received, ends the conversion with `HOOK_FAILED`; reading the result happens inside the guard too, since a
getter or proxy can throw. An `update` that fails does not throw into the caller's mapper, it is recorded and fails
the conversion when the mapper returns. Hooks must be synchronous, as `convert` is: a hook that returns a promise or
another thenable fails with `HOOK_FAILED` and a `TypeError` saying so, instead of its work being lost or arriving
after the bundle. For the same reason `extend` works only while its mapper runs; a context kept and called later (by
an async mapper after an `await`, or a callback) throws a `TypeError`, so a finished bundle never changes behind the
caller's back. Hooks receive a `HookContext` (`message`, `segmentIndex`) to read what the mapping does not carry.

## Alternatives considered

- **`convert` without validation, `validate` separately.** Faster, but callers would get a bundle without knowing the
  message deviated from the standard; a conversion that silently dropped a malformed date is worse than a slower one.
- **The parse failure codes as `ConvertFailure` codes.** More precise in the type, but five codes that callers handle
  alike; the precise code is in the last issue.
- **Hooks that throw through.** Simpler, but every caller would need a `try` around a function that otherwise returns
  `Result`.
- **Accepting `Map` options in addition to records.** Convenient for hostile keys, but the normalization already makes
  records safe; one form keeps the type simple, and rejecting the others says so instead of reading them as empty.
- **Asynchronous hooks (`convertAsync`).** Hooks that look up codes in a terminology server would need it, but it
  doubles the API for a need no user has stated; a caller can resolve such data before the conversion.
- **Unknown option names ignored.** A misspelled `timeZone` would be silently ignored, and times would be cut to dates.

## Consequences

- One function call gives the bundle and everything to know about the message; the result is plain data.
- Options errors surface when the converter is made in tests, not in production on the first message.
- Hooks see FHIR resources typed by `@types/fhir`; their results are checked only for their resource type, so a hook
  can still return an invalid resource, which the FHIR validator of the caller has to catch.
