"use client";

import {
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
} from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { loadCatalogPage } from "@/app/inventory/actions";
import {
  type CatalogEntry,
  type CatalogQuery,
  skuHref,
} from "@/libs/inventory";

import { PartImage } from "./PartImage";
import { StockStatus, TypeLabel } from "./StockStatus";

interface CatalogTableProps {
  // The first step of results, rendered on the server
  entries: CatalogEntry[];
  total: number;
  query: CatalogQuery;
  base: string;
}

// The list view: one scrollable table that loads more rows near its end
export function CatalogTable({
  entries: first,
  total,
  query,
  base,
}: CatalogTableProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(first);
  const [loading, setLoading] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const loaded = useRef(1);
  const { ref, entry } = useIntersection({ threshold: 0 });
  const hasMore = entries.length < total && !stopped;

  useEffect(() => {
    if (!entry?.isIntersecting || !hasMore || loading) return;
    setLoading(true);
    loadCatalogPage(
      { ...query, page: loaded.current + 1 },
      base === "/inventory",
    )
      .then((next) => {
        loaded.current += 1;
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
  }, [entry?.isIntersecting, hasMore, loading, query, base]);

  return (
    <Box
      bg="white"
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-md)",
        overflow: "auto",
        maxHeight: "70vh",
      }}
    >
      <Table
        highlightOnHover
        stickyHeader
        verticalSpacing="sm"
        horizontalSpacing="md"
      >
        <TableThead>
          <TableTr>
            <TableTh w={72}>Image</TableTh>
            <TableTh>Name</TableTh>
            <TableTh>SKU</TableTh>
            <TableTh>Type</TableTh>
            <TableTh>Stock</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {entries.map((entry) => {
            const href = skuHref(entry.sku, base);
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
                  <Box w={48}>
                    <PartImage
                      src={entry.imageUrl}
                      alt={entry.name}
                      ratio={1}
                      radius="sm"
                    />
                  </Box>
                </TableTd>
                <TableTd>
                  <Text size="sm" fw={500}>
                    {entry.name}
                  </Text>
                </TableTd>
                <TableTd>
                  <Text size="sm" c="dimmed" ff="monospace">
                    {entry.sku}
                  </Text>
                </TableTd>
                <TableTd>
                  <TypeLabel isProduct={entry.isProduct} />
                </TableTd>
                <TableTd>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" fw={500}>
                      {entry.stockCount}
                    </Text>
                    <StockStatus count={entry.stockCount} />
                  </Group>
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
          <Text size="xs" c="dimmed">
            {stopped ?? `${entries.length} of ${total}`}
          </Text>
        )}
      </Group>
    </Box>
  );
}
