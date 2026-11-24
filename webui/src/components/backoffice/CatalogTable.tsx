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
import { CatalogSortHeader } from "./CatalogSorting";
import { PartImage } from "./PartImage";
import { StockMeter } from "./StockCounts";

interface CatalogTableProps {
  // The first step of results, rendered on the server
  entries: CatalogEntry[];
  total: number;
  query: CatalogQuery;
  pending?: boolean;
}

type CatalogBatch = {
  first: CatalogEntry[];
  entries: CatalogEntry[];
  loading: boolean;
  stopped: string | null;
};

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
  pending = false,
}: CatalogTableProps) {
  const router = useRouter();
  const [batch, setBatch] = useState<CatalogBatch>({
    first, entries: first, loading: false, stopped: null,
  });
  if (batch.first !== first) {
    setBatch({ first, entries: first, loading: false, stopped: null });
  }
  const { entries, loading, stopped } = batch;
  const { ref, entry } = useIntersection({ threshold: 0 });
  // A delete refreshes the page, so total already excludes deleted rows
  const hasMore = entries.length < total && !stopped;

  useEffect(() => {
    if (pending || !entry?.isIntersecting || !hasMore || loading) return;
    setBatch((current) => ({ ...current, loading: true }));
    // Continue after the rows shown, so a deleted row doesn't skip one
    loadCatalogPage(query, entries.length)
      .then((next) => {
        // Rows can shift while scrolling; skip any already shown
        setBatch((current) => {
          if (current.first !== first) return current;
          const seen = new Set(current.entries.map((row) => row.id));
          const newRows = next.entries.filter((row) => !seen.has(row.id));
          return {
            ...current,
            loading: false,
            entries: [...current.entries, ...newRows],
            stopped: newRows.length === 0 ? "No more results" : null,
          };
        });
      })
      .catch(() =>
        setBatch((current) => current.first === first
          ? { ...current, loading: false, stopped: "Could not load more results" }
          : current),
      );
  }, [entry?.isIntersecting, first, hasMore, loading, pending, query, entries.length]);

  return (
    <Box
      className="panel"
      style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)" }}
    >
      <Table
        aria-busy={pending || loading}
        highlightOnHover
        stickyHeader
        verticalSpacing={8}
        horizontalSpacing="md"
        miw={{ base: 0, sm: 720 }}
      >
        <TableThead>
          <TableTr>
            <CatalogSortHeader label="Unit" field="name" query={query} />
            <CatalogSortHeader label="Price" field="price" query={query} ta="right" w={90} visibleFrom="sm" />
            <CatalogSortHeader label="Total" field="amount" query={query} ta="right" w={90} visibleFrom="sm" />
            <CatalogSortHeader label="In use" field="in_use" query={query} ta="right" w={90} visibleFrom="sm" />
            <CatalogSortHeader label="Available" field="available" query={query} ta="right" w={90} visibleFrom="sm" />
            <CatalogSortHeader label="Utilisation" field="utilisation" query={query} w={140} visibleFrom="sm" />
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
                      setBatch((current) => ({
                        ...current,
                        entries: current.entries.filter((row) => row.id !== entry.id),
                      }))
                    }
                  />
                </TableTd>
              </TableTr>
            );
          })}
        </TableTbody>
      </Table>
      <Group ref={ref} justify="center" py="sm">
        {loading || pending ? (
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
