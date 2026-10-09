# Security policy

## Supported versions

`hl7-to-fhir` has not been released yet. Once it is, only the latest release receives security fixes; to get a fix,
upgrade to the latest release.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/Soeren04/kindling-hl7-fhir/security/advisories/new).
Do not open a public issue, pull request or discussion for a vulnerability.

Include the affected version, a description of the impact and a synthetic reproduction. You will get a first
response within seven days. Once a fix is released, the advisory is published with credit to the reporter unless
you prefer to stay anonymous.

Examples of what counts as a vulnerability. The parser, the CLI and the playground are not released yet, so these
apply from the release that contains them:

- input that makes the parser hang, consume unbounded memory or crash instead of returning a result (denial of
  service, including regular-expression backtracking);
- diagnostics, errors or CLI output that leak message content where the documentation promises they do not;
- CLI behavior that writes outside the requested output location or overwrites files without `--force`;
- the playground sending message content anywhere.

## Memory use when parsing untrusted input

Parsing time and memory are linear in the size of the input, but the factor for memory is large. The parser keeps the
whole message as a tree in which every field, repetition, component and subcomponent is an object with its own
character span: about 110 bytes per object. The tree of a segment-heavy message therefore retains roughly 160 times
the size of the input, and a short one up to about 180 times:

| Input                                     | Retained memory | Per input byte |
| ----------------------------------------- | --------------: | -------------: |
| ORU^R01 with 17,000 OBX segments (1 MB)   |          159 MB |           157x |
| ORU^R01 with 50 OBX segments (3 KB)       |          498 KB |           161x |
| ADT^A01 (0.6 KB)                          |          112 KB |           182x |
| One field of 500,000 subcomponents (1 MB) |           50 MB |            50x |
| One field of plain text (1 MB)            |            1 MB |             1x |

The numbers come from `pnpm bench:memory` (see
[`packages/hl7-to-fhir/bench/README.md`](packages/hl7-to-fhir/bench/README.md)); they depend on the JavaScript engine.
Fields that hold only empty subcomponents retain nothing.

The library has no size limit of its own, so a service that parses messages from outside its trust boundary should limit
the size of the input before it calls `parse` or `splitBatch`, for example by rejecting HTTP bodies and MLLP frames
above a few hundred kilobytes (160 times that is the memory one request can hold), and by parsing the messages of a
batch one after the other instead of all at once. A real HL7 v2 message is rarely larger than a few dozen kilobytes.
`splitBatch` only finds the boundaries between messages and keeps the input strings, so its memory is proportional to the
input. Memory within the factors above is documented behavior, not a vulnerability; input that makes the parser retain
much more per byte is one.

## Patient data posted by mistake

This project only ever needs synthetic or fully de-identified HL7 messages. If real patient data (protected health
information, PHI) was posted in an issue, pull request, discussion or commit:

1. **Do not quote, copy or reply to it.** Every quote creates another copy.
2. **Report it privately** through
   [GitHub private vulnerability reporting](https://github.com/Soeren04/kindling-hl7-fhir/security/advisories/new),
   with a link to the location but without the data itself.
3. The maintainer then, as soon as possible:
   - deletes the comment or edits out the data, and deletes the edit history entry that still shows it;
   - for data in an issue body that cannot be cleaned, deletes the issue;
   - for data in a commit or pull request, removes it from the branch and asks GitHub Support to purge cached views
     and pull request references, following
     [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository);
   - labels the cleaned-up thread `phi-removed` and tells the reporter what was done.
4. If you posted your own organization's data, inform your organization's privacy or security officer: depending on
   your jurisdiction, the disclosure may have to be reported.
