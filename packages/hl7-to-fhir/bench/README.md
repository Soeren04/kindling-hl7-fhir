# Benchmarks

Throughput and memory of `parse` and `splitBatch`. They are not part of `pnpm verify`: timings depend on the machine,
so they are run by hand when the parser changes.

```sh
pnpm bench          # throughput with `vitest bench`
pnpm bench:memory   # heap retained by a parsed message
```

Both build the library first and measure `dist/hl7v2.js`, the code consumers run. Measuring the sources through
Vitest's module runner adds a property lookup to every call between modules and made the parser look about 1.5 times
slower. The inputs are in [`inputs.ts`](inputs.ts): the synthetic samples, an ORU^R01 with 50 OBX, and generated
inputs of about 1 MB.

## Results

Intel Xeon @ 2.80 GHz (4 vCPUs, 16 GB, Linux 6.18 virtual machine), Node.js 22.22.0, Vitest 5.0.3, 8 October 2026.
The 1 MB rows have a margin of error of ±9 to ±16 %.

| Input                                         | Size   | Operations/s | Time per operation | Throughput |
| --------------------------------------------- | ------ | -----------: | -----------------: | ---------: |
| `parse` ADT^A01, 6 segments                   | 0.6 KB |       29,900 |            0.04 ms |    18 MB/s |
| `parse` ORU^R01, 50 OBX                       | 3.1 KB |        4,660 |            0.25 ms |    14 MB/s |
| `parse` ORU^R01, 17,000 OBX                   | 1.0 MB |          3.4 |             307 ms |   3.3 MB/s |
| `parse` one field of plain text               | 1.0 MB |         57.9 |              17 ms |    58 MB/s |
| `parse` one field of escape sequences         | 1.0 MB |         25.7 |              39 ms |    26 MB/s |
| `parse` one field of 500,000 subcomponents    | 1.0 MB |          9.0 |             115 ms |   9.0 MB/s |
| `parse` one field of 1,000,000 empty subcomp. | 1.0 MB |          4.5 |             224 ms |   4.5 MB/s |
| `splitBatch` batch of ADT^A01 messages        | 1.0 MB |          229 |             4.4 ms |   229 MB/s |

The parser is linear in the input (`test/property/parse.test.ts` checks that with a time budget). The cost per byte
depends on how many nodes a byte makes: plain text is one node, a segment such as an OBX about 10 fields with several
levels each. The 1 MB ORU takes about 3.5 times longer per OBX than the one with 50, which fits the cost of
collecting a 159 MB tree.

Heap retained after a garbage collection by the parsed message (`pnpm bench:memory`; the first row includes
one-time costs of the first parse):

| Input                             | Retained | Per input byte | Tree objects | Per object |
| --------------------------------- | -------: | -------------: | -----------: | ---------: |
| ADT^A01                           |   112 KB |           182x |          568 |      198 B |
| ORU^R01, 50 OBX                   |   498 KB |           161x |        4,348 |      115 B |
| ORU^R01, 17,000 OBX (1 MB)        |   159 MB |           157x |    1,404,418 |      113 B |
| 1 MB plain text field             |   1.0 MB |             1x |          130 |          - |
| 1 MB field of escape sequences    |   1.3 MB |             1x |          130 |          - |
| 1 MB field of 500,000 subcomp.    |    50 MB |            50x |    1,000,128 |       50 B |
| 1 MB field of empty subcomponents |   1.0 MB |             1x |          118 |          - |

A tree object is a node or a span. Fields that hold only empty subcomponents are trimmed, so they cost time but
retain nothing.

The decision about the span representation, with the experiment behind it, is in
[ADR 0008](../../../docs/adr/0008-message-model-and-indexing.md).
