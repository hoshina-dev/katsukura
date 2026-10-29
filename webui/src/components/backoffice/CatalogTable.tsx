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
  VisuallyHidden,
} from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const loaded = useRef(1);
  const { ref, entry } = useIntersection({ threshold: 0 });
  const [deleted, setDeleted] = useState(0);
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
      className="panel"
      style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)" }}
    >
      <Table
        highlightOnHover
        stickyHeader
        verticalSpacing={8}
        horizontalSpacing="md"
        miw={720}
      >
        <TableThead>
          <TableTr>
            <TableTh>Part</TableTh>
            <TableTh ta="right" w={90}>
              Total
            </TableTh>
            <TableTh ta="right" w={90}>
              In use
            </TableTh>
            <TableTh ta="right" w={90}>
              Available
            </TableTh>
            <TableTh w={140}>Utilisation</TableTh>
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
                      <Text size="sm" fw={500} truncate>
                        {entry.name}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {entry.sku}
                      </Text>
                    </Box>
                  </Group>
                </TableTd>
                <TableTd ta="right" fw={600}>
                  {entry.stock.total}
                </TableTd>
                <TableTd ta="right">{entry.stock.in_use}</TableTd>
                <TableTd
                  ta="right"
                  c={entry.stock.available === 0 ? "dimmed" : undefined}
                >
                  {entry.stock.available}
                </TableTd>
                <TableTd>
                  <StockMeter stock={entry.stock} />
                </TableTd>
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
            {stopped ?? `${entries.length} of ${total - deleted} parts`}
          </Text>
        )}
      </Group>
    </Box>
  );
}
