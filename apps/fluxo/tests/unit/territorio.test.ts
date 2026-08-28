import { describe, expect, it } from "vitest";
import {
  buildTerritorioPath,
  matchesSlug,
  slugifyPart,
} from "@/lib/territorio-slug";
import { isOnlineRow } from "@/lib/territorio-online";

describe("territorio", () => {
  it("slugify", () => {
    expect(slugifyPart("Belo Horizonte")).toBe("belo-horizonte");
    expect(matchesSlug("Belo Horizonte", "belo-horizonte")).toBe(true);
  });

  it("path presencial", () => {
    expect(
      buildTerritorioPath({
        estado: "MG",
        cidade: "Belo Horizonte",
      }),
    ).toBe("/territorio/mg/belo-horizonte");
  });

  it("path online", () => {
    expect(isOnlineRow({ territorio: "Online", cidade: "" })).toBe(true);
    expect(
      buildTerritorioPath({
        territorio: "Aulão Online",
        online: true,
      }),
    ).toMatch(/^\/territorio\/online\//);
  });
});
