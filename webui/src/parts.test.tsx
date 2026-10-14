import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { ParentUsages } from "./parts";
import type { Component, Part } from "./api";
function render(parents?: Component[]) {
  return renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter>
        <ParentUsages parents={parents} />
      </MemoryRouter>
    </MantineProvider>,
  );
}
describe("parent schema usages", () => {
  it("omits the section for parentless schemas and older API responses", () => {
    expect(render()).not.toContain("Used by parent schemas");
    expect(render([])).not.toContain("Used by parent schemas");
  });
  it("preserves distinct slots and parents, with parent links, caps and archive state", () => {
    const parent = {
      id: "assembly",
      name: "Assembly",
      sku: "ASSEMBLY",
      archived_at: null,
    } as Part;
    const archived = {
      ...parent,
      id: "old-assembly",
      name: "Legacy assembly",
      sku: "LEGACY",
      archived_at: "2026-01-01",
    };
    const rows = [
      {
        id: "left",
        parent_part_id: parent.id,
        parent_part: parent,
        slot: "left-motor",
        required_quantity: 2,
        is_optional: false,
      },
      {
        id: "right",
        parent_part_id: parent.id,
        parent_part: parent,
        slot: "right-motor",
        required_quantity: 3,
        is_optional: true,
      },
      {
        id: "old",
        parent_part_id: archived.id,
        parent_part: archived,
        slot: "old-motor",
        required_quantity: 4,
        is_optional: false,
      },
    ] as Component[];
    const html = render(rows);
    expect(html.match(/href="\/parts\/assembly"/g)).toHaveLength(2);
    expect(html).toContain('href="/parts/old-assembly"');
    for (const value of [
      "left-motor",
      "right-motor",
      "old-motor",
      "ASSEMBLY",
      "LEGACY",
      "Archived",
      "Optional",
      "Required",
    ])
      expect(html).toContain(value);
    for (const cap of [2, 3, 4]) expect(html).toContain(`>${cap}</td>`);
  });
  it("keeps a usable parent link when the parent object is absent", () => {
    const html = render([
      {
        id: "edge",
        parent_part_id: "parent-id",
        slot: "motor",
        required_quantity: 1,
        is_optional: false,
      } as Component,
    ]);
    expect(html).toContain('href="/parts/parent-id"');
    expect(html).toContain("parent-i");
  });
});
