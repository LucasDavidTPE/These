import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, proposedRoot, serializeSettings } from "./settings";

describe("réglages du poste", () => {
  it("défauts si absent ou abîmé", () => {
    for (const t of [null, "", "{", "[]", "null", '{"libraryRoot": 3}', '{"libraryRoot": "  "}']) {
      expect(parseSettings(t)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("aller-retour", () => {
    const s = { version: 1 as const, libraryRoot: "C:\\Users\\Lucas\\OneDrive\\Figurine" };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it("propose <OneDrive>\\Figurine", () => {
    expect(proposedRoot("C:\\Users\\Lucas\\OneDrive\\")).toBe("C:\\Users\\Lucas\\OneDrive\\Figurine");
    expect(proposedRoot("/home/l/OneDrive")).toBe("/home/l/OneDrive/Figurine");
  });
});
