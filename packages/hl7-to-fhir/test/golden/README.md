# Golden files

Expected results of the parser, `stringify`, `group` and `validate`, one set per file in `samples/`, and of grouping
messages that hold every segment of their structure. They are compared by Vitest snapshots (`toMatchFileSnapshot`).
After an intended change, update only the files of the test that changed, for example
`pnpm exec vitest run --project hl7-to-fhir -u test/hl7v2/validate/golden.test.ts`, and review the diff like code. A
run of every test with `-u` would also rewrite snapshots that fail for an unintended reason.

| File                   | Holds                                                                                  | How to review it                                      |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `*.values.txt`         | One line per value of the parsed message: its path and its text                        | This is the form to read: one change is one diff line |
| `adt-a01.json`         | The complete tree of one sample, with every span                                       | Shows the model; large, so it exists for one sample   |
| `*.canonical.hl7`      | The text `stringify` writes after parsing the sample                                   | See below                                             |
| `*.validation.txt`     | The groups of each sample and what `validate` reports about it                         | One line per segment or group, then one per issue     |
| `*.full-structure.txt` | The groups of a message with every segment of its structure, each repeatable one twice | One line per segment or group, indented by depth      |

The `*.canonical.hl7` files end their segments with a carriage return (`\r`), as HL7 v2 requires and `stringify`
writes. Git and most diff tools show such a file as a single line, so a change to it is one long changed line. Compare
it through the `*.values.txt` file of the same sample, or view it with the segments split, for example
`tr '\r' '\n' < adt-a01.canonical.hl7`. The `.gitattributes` entry `*.hl7 -text` keeps Git from converting the line
endings.
