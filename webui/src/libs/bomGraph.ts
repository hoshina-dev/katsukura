import type { BomGraph, BomSlot, BomUnit } from "./inventory";

export const BOM_NODE_WIDTH = 176;
export const BOM_NODE_HEIGHT = 58;
const COLUMN_STEP = 270;
const ROW_STEP = 84;
const PADDING = 24;

type GraphNode = {
  unit: BomUnit;
  incoming: BomSlot[];
  outgoing: BomSlot[];
  x: number;
  y: number;
};

type LayoutNode = GraphNode & {
  rank: number;
  waitingFor: number;
};

function edgePath(from: GraphNode, to: GraphNode, detour: number) {
  const x1 = from.x + BOM_NODE_WIDTH;
  const x2 = to.x - 4;
  const y1 = from.y + BOM_NODE_HEIGHT / 2;
  const y2 = to.y + BOM_NODE_HEIGHT / 2;

  if (to.x - from.x === COLUMN_STEP) {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
  }

  // An edge that skips a column uses the space above the nodes.
  return `M ${x1} ${y1} H ${x1 + 18} V ${detour} H ${x2 - 18} V ${y2} H ${x2}`;
}

export function layoutBomGraph(graph: BomGraph) {
  const nodes = new Map<string, LayoutNode>(
    graph.units.map((unit) => [
      unit.id,
      { unit, incoming: [], outgoing: [], x: 0, y: 0, rank: 0, waitingFor: 0 },
    ]),
  );

  for (const slot of graph.slots) {
    const parent = nodes.get(slot.parent_part_id);
    const child = nodes.get(slot.child_part_id);
    if (!parent || !child) continue;
    parent.outgoing.push(slot);
    child.incoming.push(slot);
    child.waitingFor += 1;
  }

  const units = Array.from(nodes.values());
  const linked = units.filter((node) => node.incoming.length || node.outgoing.length);
  const standalone = units.filter((node) => !node.incoming.length && !node.outgoing.length);
  const queue = linked.filter((node) => node.waitingFor === 0);
  for (let i = 0; i < queue.length; i += 1) {
    const parent = queue[i];
    for (const slot of parent.outgoing) {
      const child = nodes.get(slot.child_part_id)!;
      child.rank = Math.max(child.rank, parent.rank + 1);
      child.waitingFor -= 1;
      if (child.waitingFor === 0) queue.push(child);
    }
  }

  const columns: LayoutNode[][] = [];
  for (const node of linked) {
    (columns[node.rank] ??= []).push(node);
  }

  let detour = false;
  for (const node of linked) {
    if (node.outgoing.some((slot) => nodes.get(slot.child_part_id)!.rank !== node.rank + 1)) {
      detour = true;
      break;
    }
  }
  const firstRow = detour ? 64 : PADDING;
  const rows = columns.reduce((max, column) => Math.max(max, column.length), 0);
  const parentCenter = (node: GraphNode) => {
    const total = node.incoming.reduce(
      (sum, slot) => sum + nodes.get(slot.parent_part_id)!.y,
      0,
    );
    return total / Math.max(1, node.incoming.length);
  };
  columns.forEach((column, rank) => {
    if (rank > 0) {
      const centers = new Map(column.map((node) => [node, parentCenter(node)]));
      column.sort((a, b) => centers.get(a)! - centers.get(b)!);
    }
    column.forEach((node, row) => {
      node.x = PADDING + rank * COLUMN_STEP;
      node.y = firstRow + (row + (rows - column.length) / 2) * ROW_STEP;
    });
  });

  const edges = [];
  const pairs = new Set<string>();
  for (const from of linked) {
    for (const slot of from.outgoing) {
      const to = nodes.get(slot.child_part_id)!;
      const id = `${from.unit.id}/${to.unit.id}`;
      if (pairs.has(id)) continue;
      pairs.add(id);
      edges.push({
        id,
        from: from.unit.id,
        to: to.unit.id,
        path: edgePath(from, to, 15 + (edges.length % 6) * 6),
      });
    }
  }

  const linkedBottom = rows > 0 ? firstRow + (rows - 1) * ROW_STEP + BOM_NODE_HEIGHT : 0;
  const standaloneColumns = Math.min(4, standalone.length);
  const standaloneTop = linkedBottom > 0 ? linkedBottom + 40 : PADDING;
  standalone.forEach((node, index) => {
    node.x = PADDING + (index % standaloneColumns) * (BOM_NODE_WIDTH + 20);
    node.y = standaloneTop + 34 + Math.floor(index / standaloneColumns) * ROW_STEP;
  });
  const standaloneWidth = Math.max(0, standaloneColumns * (BOM_NODE_WIDTH + 20) - 20);
  const linkedWidth = columns.length > 0 ? (columns.length - 1) * COLUMN_STEP + BOM_NODE_WIDTH : 0;
  const lastStandalone = standalone.at(-1);

  return {
    nodes,
    ordered: [...columns.flat(), ...standalone],
    edges,
    linkedWidth: (linkedWidth || standaloneWidth) + PADDING * 2,
    linkedHeight: linkedBottom > 0 ? linkedBottom + PADDING : null,
    width: Math.max(linkedWidth, standaloneWidth) + PADDING * 2,
    height: (lastStandalone ? lastStandalone.y + BOM_NODE_HEIGHT : linkedBottom) + PADDING,
    standaloneCount: standalone.length,
    standaloneTop,
  };
}
