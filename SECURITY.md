# Security policy

## Supported versions

Security fixes are released for the latest minor version of the current major version of `hl7-to-fhir`.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/Soeren04/kindling-hl7-fhir/security/advisories/new).
Do not open a public issue, pull request or discussion for a vulnerability.

Include the affected version, a description of the impact and a synthetic reproduction. You will get a first
response within seven days. Once a fix is released, the advisory is published with credit to the reporter unless
you prefer to stay anonymous.

Examples of what counts as a vulnerability here:

- input that makes the parser hang, consume unbounded memory or crash instead of returning a result (denial of
  service, including regular-expression backtracking);
- diagnostics, errors or CLI output that leak message content where the documentation promises they do not;
- CLI behavior that writes outside the requested output location or overwrites files without `--force`;
- the playground sending message content anywhere.

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
