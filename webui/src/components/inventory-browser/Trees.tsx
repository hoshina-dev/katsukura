import { Text } from "@mantine/core";
import Link from "next/link";

import {
  type BomNode,
  itemHref,
  skuHref,
  type TreeNode,
} from "@/libs/inventory";

import { TreeRow } from "./TreeRow";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
  minWidth: 0,
};

export function BomTree({
  nodes,
  depth = 0,
  base,
}: {
  nodes: BomNode[];
  depth?: number;
  base?: string;
}) {
  return nodes.map((node) => (
    <TreeRow
      key={node.id}
      depth={depth}
      defaultOpen={depth === 0}
      label={
        <>
          <Link href={skuHref(node.part.sku, base)} style={linkStyle}>
            <Text size="sm" fw={500} component="span" truncate>
              {node.part.name}
            </Text>
          </Link>
          <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
            × {node.quantity}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace" ml="auto" truncate>
            {node.slot}
          </Text>
        </>
      }
      nested={
        node.children.length > 0 && (
          <BomTree nodes={node.children} depth={depth + 1} base={base} />
        )
      }
    />
  ));
}

export function InstalledTree({
  nodes,
  depth = 0,
  base,
}: {
  nodes: TreeNode[];
  depth?: number;
  base?: string;
}) {
  return nodes.map(({ item, children, truncated }) => (
    <TreeRow
      key={item.id}
      depth={depth}
      defaultOpen={depth === 0}
      label={
        <>
          <Link
            href={itemHref(item.part?.sku ?? "unknown", item.id, base)}
            style={linkStyle}
          >
            <Text size="sm" fw={500} component="span" truncate>
              {item.part?.name ?? "Unknown part"}
            </Text>
          </Link>
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {item.serial_number ?? "Unserialized"}
          </Text>
          {truncated && (
            <Text size="xs" c="dimmed" ml="auto" style={{ flexShrink: 0 }}>
              more not shown
            </Text>
          )}
        </>
      }
      nested={
        children.length > 0 && (
          <InstalledTree nodes={children} depth={depth + 1} base={base} />
        )
      }
    />
  ));
}
