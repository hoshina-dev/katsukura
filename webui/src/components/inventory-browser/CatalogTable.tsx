"use client";

import {
  Box,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import { useRouter } from "next/navigation";

import { type CatalogEntry, skuHref } from "@/libs/inventory";

import { PartImage } from "./PartImage";
import { StockStatus, TypeLabel } from "./StockStatus";

export function CatalogTable({
  entries,
  base,
}: {
  entries: CatalogEntry[];
  base: string;
}) {
  const router = useRouter();

  return (
    <Box
      bg="white"
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-md)",
        overflowX: "auto",
      }}
    >
      <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
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
    </Box>
  );
}
