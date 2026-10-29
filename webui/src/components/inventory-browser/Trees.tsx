import { Text } from "@mantine/core";

import {
  type BomNode,
  itemHref,
  serialLabel,
  skuHref,
  type TreeNode,
} from "@/libs/inventory";

import { TextLink } from "./TextLink";
import { TreeRow } from "./TreeRow";

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
          <TextLink href={skuHref(node.part.sku, base)} fw={500} truncate>
            {node.part.name}
          </TextLink>
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
          <TextLink
            href={itemHref(item.part?.sku ?? "unknown", item.id, base)}
            fw={500}
            truncate
          >
            {item.part?.name ?? "Unknown part"}
          </TextLink>
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {serialLabel(item)}
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
