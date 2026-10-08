import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const templateDirectory = path.resolve(
  import.meta.dirname,
  "../.github/ISSUE_TEMPLATE",
);
const formFiles = readdirSync(templateDirectory).filter(
  (file) => file !== "config.yml",
);

const elementTypes = new Set([
  "markdown",
  "textarea",
  "input",
  "dropdown",
  "checkboxes",
]);

type YamlMapping = Readonly<Partial<Record<string, unknown>>>;

function isMapping(value: unknown): value is YamlMapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readYaml(file: string): YamlMapping {
  const content: unknown = parse(readFileSync(file, "utf8"));
  if (!isMapping(content)) throw new Error(`${file} is not a YAML mapping`);
  return content;
}

function bodyOf(form: YamlMapping): readonly YamlMapping[] {
  const body = form["body"];
  if (!Array.isArray(body) || !body.every(isMapping))
    throw new Error("body must be a list of mappings");
  return body;
}

function attributesOf(element: YamlMapping): YamlMapping {
  const attributes = element["attributes"];
  if (!isMapping(attributes)) throw new Error("every element needs attributes");
  return attributes;
}

const labelNames = new Set(
  (
    parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../.github/labels.yml"),
        "utf8",
      ),
    ) as unknown[]
  )
    .filter(isMapping)
    .map((label) => label["name"]),
);

describe("issue template chooser", () => {
  it("disables blank issues", () => {
    expect(
      readYaml(path.join(templateDirectory, "config.yml"))[
        "blank_issues_enabled"
      ],
    ).toBe(false);
  });
});

describe.each(formFiles)("issue form %s", (file) => {
  const form = readYaml(path.join(templateDirectory, file));
  const body = bodyOf(form);

  it("has a name, a description and documented labels", () => {
    expect(form["name"]).toEqual(expect.any(String));
    expect(form["description"]).toEqual(expect.any(String));
    const labels = form["labels"];
    expect(Array.isArray(labels) && labels.length > 0).toBe(true);
    for (const label of labels as unknown[])
      expect(labelNames).toContain(label);
  });

  it("uses only valid elements with unique ids", () => {
    for (const element of body) {
      expect(elementTypes).toContain(element["type"]);
      const attributes = attributesOf(element);
      if (element["type"] === "markdown")
        expect(attributes["value"]).toEqual(expect.any(String));
      else expect(attributes["label"]).toEqual(expect.any(String));
    }
    const ids = body
      .map((element) => element["id"])
      .filter((id) => id !== undefined);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("warns against posting patient data before any input", () => {
    const [first] = body;
    expect(first?.["type"]).toBe("markdown");
    expect(first && attributesOf(first)["value"]).toContain(
      "Never post real patient data",
    );
  });

  it("requires confirming that the data is synthetic or de-identified", () => {
    const checkbox = body.find((element) => element["id"] === "synthetic-data");
    expect(checkbox?.["type"]).toBe("checkboxes");
    expect(checkbox && attributesOf(checkbox)["options"]).toStrictEqual([
      {
        label:
          "Every message, resource and log in this issue is synthetic or fully de-identified.",
        required: true,
      },
    ]);
  });
});
