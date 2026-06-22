import { describe, it, expect } from "vitest";
import { parseTeamHierarchy, isValidBug, isClassificationBug, isOpen, isClosed } from "../linear";
import { makeBug } from "../../__tests__/fixtures";

describe("parseTeamHierarchy", () => {
  it("parses bracketed vertical prefix", () => {
    expect(parseTeamHierarchy("[Marketplace] Checkout")).toEqual({ vertical: "Marketplace", subteam: "Checkout" });
  });

  it("maps Collecting prefix to Collections vertical", () => {
    expect(parseTeamHierarchy("Collecting Squad")).toEqual({ vertical: "Collections", subteam: "Squad" });
  });

  it("maps bare Collecting team to Collections (main)", () => {
    expect(parseTeamHierarchy("Collecting")).toEqual({ vertical: "Collections", subteam: "(main)" });
  });

  it("falls back to team name as vertical", () => {
    expect(parseTeamHierarchy("Payments")).toEqual({ vertical: "Payments", subteam: "" });
  });
});

describe("isValidBug", () => {
  it("accepts a normal open bug", () => {
    expect(isValidBug(makeBug())).toBe(true);
  });

  it("rejects canceled stateType", () => {
    expect(isValidBug(makeBug({ stateType: "canceled", status: "Canceled" }))).toBe(false);
  });

  it("rejects excluded statuses regardless of case", () => {
    for (const status of ["Duplicate", "Cannot Reproduce", "Invalid", "As Designed", "Won't Fix", "Not a bug"]) {
      expect(isValidBug(makeBug({ status }))).toBe(false);
    }
  });

  it("accepts completed bugs (valid scope includes closed)", () => {
    expect(isValidBug(makeBug({ stateType: "completed", status: "Done" }))).toBe(true);
  });
});

describe("isClassificationBug", () => {
  it("accepts an open triage bug", () => {
    expect(isClassificationBug(makeBug({ stateType: "triage", status: "Triage" }))).toBe(true);
  });

  it("rejects closed bugs", () => {
    expect(isClassificationBug(makeBug({ stateType: "completed", status: "Done" }))).toBe(false);
  });

  it("rejects release-ready / done statuses even when state is open", () => {
    for (const status of ["Release Ready", "Done", "Released/Done"]) {
      expect(isClassificationBug(makeBug({ stateType: "started", status }))).toBe(false);
    }
  });

  it("rejects anything that fails isValidBug", () => {
    expect(isClassificationBug(makeBug({ status: "Duplicate" }))).toBe(false);
  });
});

describe("state helpers", () => {
  it("isOpen covers triage/backlog/unstarted/started", () => {
    for (const stateType of ["triage", "backlog", "unstarted", "started"] as const) {
      expect(isOpen(makeBug({ stateType }))).toBe(true);
    }
    expect(isOpen(makeBug({ stateType: "completed" }))).toBe(false);
  });

  it("isClosed covers completed/canceled", () => {
    expect(isClosed(makeBug({ stateType: "completed" }))).toBe(true);
    expect(isClosed(makeBug({ stateType: "canceled" }))).toBe(true);
    expect(isClosed(makeBug({ stateType: "backlog" }))).toBe(false);
  });
});
