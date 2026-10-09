import type { Issue, IssueCode, Location } from "./issue";
import { issue } from "./issue-table";
import { emptySpanAt } from "./span";

/**
 * The most issues one call reports. Hostile input can hold an issue every few characters; the limit keeps the issue
 * list from growing with the input while leaving far more than anyone reads.
 */
export const maxIssues = 10_000;

/**
 * Creates the issue of `code` (see {@link issue}) and adds it to `issues`, unless the list is full: it keeps at most
 * one issue more than {@link maxIssues}, which tells {@link finishIssues} that issues were dropped.
 */
export function report(
  issues: Issue[],
  code: IssueCode,
  location: Location,
  value?: string,
): void {
  if (issues.length <= maxIssues) issues.push(issue(code, location, value));
}

/**
 * Turns the collected issues into the reported list: sorted by their position in the input (issues at the same
 * position keep the order they were found in) and, when issues were dropped, cut to {@link maxIssues} and ended by
 * one `TOO_MANY_ISSUES` warning located at the end of the input.
 *
 * @param inputLength - The length of the input, where `TOO_MANY_ISSUES` is located.
 */
export function finishIssues(
  issues: readonly Issue[],
  inputLength: number,
): Issue[] {
  const sorted = inMessageOrder(issues);
  if (sorted.length <= maxIssues) return sorted;
  return sorted
    .slice(0, maxIssues)
    .concat(issue("TOO_MANY_ISSUES", { span: emptySpanAt(inputLength) }));
}

/**
 * The issues sorted by their position in the input; issues at the same position keep the order they were found in.
 */
export function inMessageOrder(issues: readonly Issue[]): Issue[] {
  return issues
    .slice()
    .sort((a, b) => a.location.span.start - b.location.span.start);
}
