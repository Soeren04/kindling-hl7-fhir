import { describe, expect, it } from "vitest";

import {
  parseDate,
  parseDateTime,
  parseTime,
  parseTimezone,
} from "../../src/fhir/date-time-parse";

describe("parseDateTime", () => {
  it.each([
    ["2024", { date: "2024" }],
    ["202401", { date: "2024-01" }],
    ["20240115", { date: "2024-01-15" }],
    ["20240115+0100", { date: "2024-01-15", offset: "+01:00" }],
    [
      "2024011510",
      { date: "2024-01-15", time: { time: "10:00:00", filled: true } },
    ],
    [
      "202401151030-0530",
      {
        date: "2024-01-15",
        time: { time: "10:30:00", filled: true },
        offset: "-05:30",
      },
    ],
    [
      "20240115103045",
      { date: "2024-01-15", time: { time: "10:30:45", filled: false } },
    ],
    [
      "20240115103045.1234+1400",
      {
        date: "2024-01-15",
        time: { time: "10:30:45", fraction: "1234", filled: false },
        offset: "+14:00",
      },
    ],
    ["20240229", { date: "2024-02-29" }],
  ])("reads %j", (text, parts) => {
    expect(parseDateTime(text)).toStrictEqual(parts);
  });

  it.each([
    "",
    "24",
    "20240230",
    "20230229",
    "2024011524",
    "202401151060",
    "20240115103045.",
    "20240115103045.12345",
    "20240115+1401",
    "20240115+01",
    "2024-01-15",
    "00000101",
    "0000",
  ])("rejects %j", (text) => {
    expect(parseDateTime(text)).toBeUndefined();
  });
});

describe("parseTime", () => {
  it.each([
    ["10", { time: { time: "10:00:00", filled: true } }],
    ["1030", { time: { time: "10:30:00", filled: true } }],
    ["103045", { time: { time: "10:30:45", filled: false } }],
    [
      "103045.5+0100",
      {
        time: { time: "10:30:45", fraction: "5", filled: false },
        offset: "+01:00",
      },
    ],
  ])("reads %j", (text, parts) => {
    expect(parseTime(text)).toStrictEqual(parts);
  });

  it.each(["", "1", "24", "1060", "103045.", "10:30"])("rejects %j", (text) => {
    expect(parseTime(text)).toBeUndefined();
  });
});

describe("parseDate", () => {
  it.each([
    ["1980", "1980"],
    ["198001", "1980-01"],
    ["19800101", "1980-01-01"],
    ["1980010110", undefined],
    ["19800101+0100", undefined],
    ["19801301", undefined],
    ["0000", undefined],
  ])("reads %j as %j", (text, date) => {
    expect(parseDate(text)).toBe(date);
  });
});

describe("parseTimezone", () => {
  it.each(["Z", "+01:00", "-05:30", "+14:00", "-00:00", "+13:59"])(
    "accepts %j",
    (text) => {
      expect(parseTimezone(text)).toBe(text);
    },
  );

  it.each([
    "",
    "+0100",
    "+1:00",
    "+14:01",
    "+15:00",
    "+01:60",
    "z",
    "UTC",
    "Europe/Berlin",
    "+01:00\n",
  ])("rejects %j", (text) => {
    expect(parseTimezone(text)).toBeUndefined();
  });
});
