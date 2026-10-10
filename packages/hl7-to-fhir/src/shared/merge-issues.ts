// The issues of a conversion come from several steps over one input (parsing, validation, mapping), each with its own
// list; they are reported as one list, as each step alone reports its own.
import { finishIssues, maxIssues } from "./collect";
import type { Issue } from "./issue";
import { issue } from "./issue-table";
import { emptySpanAt } from "./span";

/**
 * Merges the issue lists of several steps over one input into one reported list, as {@link finishIssues} finishes
 * one list: an issue two steps both found (the same code at the same span, such as an invalid date that validation and
 * mapping both report) is kept once, and when a step had to cut its list, the merged list ends with
 * `TOO_MANY_ISSUES` as well.
 *
 * @param inputLength - The length of the input, where `TOO_MANY_ISSUES` is located.
 */
export function mergeIssues(
  lists: readonly (readonly Issue[])[],
  inputLength: number,
): Issue[] {
  const seen = new Set<string>();
  const merged: Issue[] = [];
  let cut = false;
  for (const found of lists.flat()) {
    if (found.code === "TOO_MANY_ISSUES") {
      cut = true;
      continue;
    }
    const { start, end } = found.location.span;
    const key = `${found.code} ${String(start)} ${String(end)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(found);
  }
  const finished = finishIssues(merged, inputLength);
  return cut && finished.length <= maxIssues
    ? finished.concat(
        issue("TOO_MANY_ISSUES", { span: emptySpanAt(inputLength) }),
      )
    : finished;
}
