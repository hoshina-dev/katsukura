import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  missingQuantity,
  metadataFields,
  parseMetadata,
  query,
  type Component,
  type Installation,
} from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("metadata object validation", () => {
  it("preserves nested objects and custom properties", () =>
    expect(
      parseMetadata('{"labels":["motor"],"calibration":{"value":2}}'),
    ).toEqual({ labels: ["motor"], calibration: { value: 2 } }));
  it.each(["null", "[]", "42", "true", '"text"'])(
    "rejects nonobject metadata: %s",
    (value) =>
      expect(() => parseMetadata(value)).toThrow(
        "Metadata must be a JSON object",
      ),
  );
  it("rejects malformed JSON before writing", () =>
    expect(() => parseMetadata("{bad}")).toThrow());
});
describe("BOM availability", () => {
  const component = { id: "slot-a", required_quantity: 2 } as Component;
  it("counts only active installations for the exact BOM slot", () => {
    const rows = [
      { part_component_id: "slot-a", removed_at: null },
      { part_component_id: "slot-a", removed_at: "2026-01-01" },
      { part_component_id: "slot-b", removed_at: null },
    ] as Installation[];
    expect(missingQuantity(component, rows)).toBe(1);
  });
  it("never offers negative availability on a conflicting stale response", () =>
    expect(
      missingQuantity(
        component,
        Array(3).fill({ part_component_id: "slot-a", removed_at: null }),
      ),
    ).toBe(0));
});
describe("HTTP adapter", () => {
  it("surfaces the backend invariant message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "conflict", message: "Quantity limit exceeded" },
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(api("/inventory/a/components", "POST", {})).rejects.toThrow(
      "Quantity limit exceeded",
    );
  });
  it("preserves nullable PATCH fields for clear and restore", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api("/inventory/a", "PATCH", {
      location: null,
      serial_number: null,
      archived_at: null,
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      location: null,
      serial_number: null,
      archived_at: null,
    });
  });
  it("handles empty successful DELETE responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(api("/inventory/a", "DELETE")).resolves.toBeUndefined();
  });
  it("reports invalid response formats clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>")));
    await expect(api("/inventory")).rejects.toThrow("invalid response");
  });
  it("encodes search and filter values with real pagination", () =>
    expect(
      query({
        search: "a & b",
        offset: 40,
        include_archived: false,
        part_id: "",
      }),
    ).toBe("?search=a+%26+b&offset=40&include_archived=false"));
});

describe("metadata updates", () => {
  it("omits unchanged metadata from edits to preserve server numeric precision", async () => {
    const initial = JSON.stringify(
      JSON.parse('{"large":9007199254740993}'),
      null,
      2,
    );
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api("/inventory/a", "PATCH", {
      location: "Shelf B",
      ...metadataFields(initial, initial),
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      location: "Shelf B",
    });
  });
  it("sends changed metadata after object validation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api("/parts/a", "PATCH", metadataFields('{"label":"new"}', "{}"));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      metadata: { label: "new" },
    });
    expect(() => metadataFields("[]", "{}")).toThrow(
      "Metadata must be a JSON object",
    );
    expect(() => metadataFields("{bad}", "{}")).toThrow(
      "Metadata must be valid JSON",
    );
  });
  it("includes metadata on create even when the editor has its initial value", () => {
    expect(metadataFields("{}")).toEqual({ metadata: {} });
  });
});
