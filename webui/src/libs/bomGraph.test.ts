import { describe, expect, it } from "vitest";

import { BOM_NODE_HEIGHT, layoutBomGraph } from "./bomGraph";
import type { BomSlot, BomUnit } from "./inventory";

function unit(id: string): BomUnit {
  return { id, sku: id.toUpperCase(), name: id, archived_at: null };
}

function slot(id: string, parent: string, child: string, quantity = 1): BomSlot {
  return {
    id,
    parent_part_id: parent,
    child_part_id: child,
    slot: id,
    required_quantity: quantity,
  };
}

describe("BOM graph layout", () => {
  it("places shared components once and keeps every slot in the inspector data", () => {
    const direct = slot("spare", "root", "leaf", 2);
    const fastener = slot("fastener", "module", "leaf", 4);
    const second = slot("second", "module", "leaf", 3);
    const graph = layoutBomGraph({
      units: ["leaf", "standalone", "module", "root"].map(unit),
      slots: [fastener, second, direct, slot("mount", "root", "module")],
    });

    const root = graph.nodes.get("root")!;
    const module = graph.nodes.get("module")!;
    const leaf = graph.nodes.get("leaf")!;
    const standalone = graph.nodes.get("standalone")!;
    expect(root.x).toBeLessThan(module.x);
    expect(module.x).toBeLessThan(leaf.x);
    expect(leaf.incoming).toEqual([fastener, second, direct]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.find((edge) => edge.from === "root" && edge.to === "leaf")?.path).toContain(" V ");
    expect(graph.ordered.filter((node) => node.unit.id === "leaf")).toHaveLength(1);
    expect(standalone.y).toBeGreaterThan(leaf.y + BOM_NODE_HEIGHT);
    expect(graph.standaloneCount).toBe(1);
  });

  it("keeps units visible when there are no BOMs", () => {
    const graph = layoutBomGraph({
      units: Array.from({ length: 13 }, (_, index) => unit(`part-${index}`)),
      slots: [],
    });
    expect(graph.ordered).toHaveLength(13);
    expect(graph.edges).toHaveLength(0);
    expect(graph.standaloneCount).toBe(13);
    expect(graph.ordered.at(-1)!.y + BOM_NODE_HEIGHT).toBeLessThan(graph.height);
  });
});
