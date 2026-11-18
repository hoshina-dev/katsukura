"use client";

import {
  Badge,
  Box,
  Group,
  Loader,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import { useRouter } from "@/libs/nav";
import { useEffect, useState } from "react";

import { loadCatalogPage } from "@/app/actions";
import {
  type CatalogEntry,
  type CatalogQuery,
  skuHref,
} from "@/libs/inventory";

import { DeletePartButton } from "./DeletePartButton";
import { PartImage } from "./PartImage";
import { StockMeter } from "./StockCounts";

interface CatalogTableProps {
  // The first step of results, rendered on the server
  entries: CatalogEntry[];
  total: number;
  query: CatalogQuery;
}

// Marks a unit with a bill of materials
export function AssemblyBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge
      color="gray"
      variant="light"
      radius="sm"
      size="xs"
      style={{ flexShrink: 0 }}
    >
      Assembly · {count} {count === 1 ? "slot" : "slots"}
    </Badge>
  );
}

// One scrollable table that loads more rows near its end
export function CatalogTable({
  entries: first,
  total,
  query,
}: CatalogTableProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(first);
  const [loading, setLoading] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const { ref, entry } = useIntersection({ threshold: 0 });
  // A delete refreshes the page, so total already excludes deleted rows
  const hasMore = entries.length < total && !stopped;

  useEffect(() => {
    if (!entry?.isIntersecting || !hasMore || loading) return;
    setLoading(true);
    // Continue after the rows shown, so a deleted row doesn't skip one
    loadCatalogPage(query, entries.length)
      .then((next) => {
        // Rows can shift while scrolling; skip any already shown
        setEntries((current) => {
          const seen = new Set(current.map((row) => row.id));
          return [
            ...current,
            ...next.entries.filter((row) => !seen.has(row.id)),
          ];
        });
        if (next.entries.length === 0) setStopped("No more results");
      })
      .catch(() => setStopped("Could not load more results"))
      .finally(() => setLoading(false));
  }, [entry?.isIntersecting, hasMore, loading, query, entries.length]);

  return (
    <Box
      className="panel"
      style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)" }}
    >
      <Table
        highlightOnHover
        stickyHeader
        verticalSpacing={8}
        horizontalSpacing="md"
        miw={{ base: 0, sm: 720 }}
      >
        <TableThead>
          <TableTr>
            <TableTh>Unit</TableTh>
            <TableTh ta="right" w={90} visibleFrom="sm">
              Price
            </TableTh>
            <TableTh ta="right" w={90} visibleFrom="sm">
              Total
            </TableTh>
            <TableTh ta="right" w={90} visibleFrom="sm">
              In use
            </TableTh>
            <TableTh ta="right" w={90} visibleFrom="sm">
              Available
            </TableTh>
            <TableTh w={140} visibleFrom="sm">
              Utilisation
            </TableTh>
            <TableTh w={52}>
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {entries.map((entry) => {
            const href = skuHref(entry.sku);
            return (
              <TableTr
                key={entry.id}
                tabIndex={0}
                role="link"
                aria-label={`${entry.name}, ${entry.sku}`}
                style={{ cursor: "pointer" }}
                onClick={() => router.push(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") router.push(href);
                }}
              >
                <TableTd>
                  <Group gap="sm" wrap="nowrap">
                    <Box w={36} style={{ flexShrink: 0 }}>
                      <PartImage
                        src={entry.imageUrl}
                        alt=""
                        ratio={1}
                        radius="sm"
                        iconSize={16}
                      />
                    </Box>
                    <Box miw={0}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={500} truncate>
                          {entry.name}
                        </Text>
                        <AssemblyBadge count={entry.componentCount} />
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {entry.sku}
                      </Text>
                      {entry.description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {entry.description}
                        </Text>
                      )}
                      {/* The stock columns are hidden on narrow screens */}
                      <Text
                        size="xs"
                        c="dimmed"
                        className="tabular"
                        hiddenFrom="sm"
                      >
                        {entry.effectiveUnitPrice} · {entry.stock.in_use} in use
                        · {entry.stock.available} free
                      </Text>
                    </Box>
                  </Group>
                </TableTd>
                <TableTd
                  ta="right"
                  className="tabular"
                  visibleFrom="sm"
                >
                  {entry.effectiveUnitPrice}
                </TableTd>
                <TableTd ta="right" fw={600} visibleFrom="sm">
                  {entry.stock.total}
                </TableTd>
                <TableTd ta="right" visibleFrom="sm">
                  {entry.stock.in_use}
                </TableTd>
                <TableTd
                  ta="right"
                  c={entry.stock.available === 0 ? "dimmed" : undefined}
                  visibleFrom="sm"
                >
                  {entry.stock.available}
                </TableTd>
                <TableTd visibleFrom="sm">
                  <StockMeter stock={entry.stock} />
                </TableTd>
                <TableTd>
                  <DeletePartButton
                    partId={entry.id}
                    name={entry.name}
                    itemCount={entry.stock.total}
                    onDeleted={() =>
                      setEntries((rows) =>
                        rows.filter((row) => row.id !== entry.id),
                      )
                    }
                  />
                </TableTd>
              </TableTr>
            );
          })}
        </TableTbody>
      </Table>
      <Group ref={ref} justify="center" py="sm">
        {loading ? (
          <Loader size="xs" />
        ) : (
          <Text size="xs" c="dimmed" className="tabular">
            {stopped ?? `${entries.length} of ${total} units`}
          </Text>
        )}
      </Group>
    </Box>
  );
}
