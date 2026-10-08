import fc from "fast-check";

import type { Delimiters } from "../../src/hl7v2/model";

/** Every character that may serve as a delimiter: printable ASCII that is neither a letter nor a digit. */
export const punctuation: readonly string[] = Array.from(
  String.raw`!"#$%&'()*+,-./:;<=>?@[\]^_` + "`{|}~",
);

/** Random sets of five distinct delimiters, without a truncation character. */
export const delimiterSets: fc.Arbitrary<Delimiters> = fc
  .shuffledSubarray([...punctuation], { minLength: 5, maxLength: 5 })
  .map(
    ([
      field = "",
      component = "",
      repetition = "",
      escape = "",
      subcomponent = "",
    ]) => ({
      field,
      component,
      repetition,
      escape,
      subcomponent,
    }),
  );
