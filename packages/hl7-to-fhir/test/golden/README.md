# Golden files

Expected results of the parser and of `stringify`, one set per file in `samples/`. They are compared by Vitest
snapshots (`toMatchFileSnapshot`); after an intended change, update them with `pnpm test -u` and review the diff like
code.

| File              | Holds                                                           | How to review it                                      |
| ----------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `*.values.txt`    | One line per value of the parsed message: its path and its text | This is the form to read: one change is one diff line |
| `adt-a01.json`    | The complete tree of one sample, with every span                | Shows the model; large, so it exists for one sample   |
| `*.canonical.hl7` | The text `stringify` writes after parsing the sample            | See below                                             |

The `*.canonical.hl7` files end their segments with a carriage return (`\r`), as HL7 v2 requires and `stringify`
writes. Git and most diff tools show such a file as a single line, so a change to it is one long changed line. Compare
it through the `*.values.txt` file of the same sample, or view it with the segments split, for example
`tr '\r' '\n' < adt-a01.canonical.hl7`. The `.gitattributes` entry `*.hl7 -text` keeps Git from converting the line
endings.
