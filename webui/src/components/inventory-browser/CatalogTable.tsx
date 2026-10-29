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

import { DeletePartButton } from "./DeletePartButton";
import { PartImage } from "./PartImage";

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
  const [deleted, setDeleted] = useState(0);
  const editable = base === "/backoffice";
  const hasMore = entries.length + deleted < total && !stopped;

  useEffect(() => {
    if (!entry?.isIntersecting || !hasMore || loading) return;
    setLoading(true);
    loadCatalogPage({ ...query, page: loaded.current + 1 })
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
  }, [entry?.isIntersecting, hasMore, loading, query]);

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
            <TableTh>Total</TableTh>
            <TableTh>In use</TableTh>
            <TableTh>Available</TableTh>
            {editable && <TableTh w={56} />}
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
                <TableTd fw={600}>{entry.stock.total}</TableTd>
                <TableTd>{entry.stock.in_use}</TableTd>
                <TableTd>{entry.stock.available}</TableTd>
                {editable && (
                  <TableTd>
                    <DeletePartButton
                      partId={entry.id}
                      name={entry.name}
                      itemCount={entry.stock.total}
                      onDeleted={() => {
                        setEntries((rows) =>
                          rows.filter((row) => row.id !== entry.id),
                        );
                        setDeleted((n) => n + 1);
                      }}
                    />
                  </TableTd>
                )}
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
            {stopped ?? `${entries.length} of ${total - deleted}`}
          </Text>
        )}
      </Group>
    </Box>
  );
}
