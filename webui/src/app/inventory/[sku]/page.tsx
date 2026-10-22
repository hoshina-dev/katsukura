import {
  Box,
  Group,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartImage } from "@/components/inventory-browser/PartImage";
import { EmptyNote, Section } from "@/components/inventory-browser/Section";
import {
  StockStatus,
  TypeLabel,
} from "@/components/inventory-browser/StockStatus";
import { BomTree } from "@/components/inventory-browser/Trees";
import {
  assemblyLabel,
  imageUrl,
  itemHref,
  unitsLabel,
} from "@/libs/inventory";
import { findPartBySku, getBomTree, listItems } from "@/libs/papiRest";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

export default async function SkuPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const part = await findPartBySku(decodeURIComponent(sku));
  if (!part) notFound();

  const isProduct = part.components.length > 0;
  const [items, bom] = await Promise.all([
    listItems(part.id),
    isProduct ? getBomTree(part) : Promise.resolve([]),
  ]);

  return (
    <Stack gap="xl">
      <Link href="/inventory" style={linkStyle}>
        <Text size="sm" component="span">
          ← Back to inventory
        </Text>
      </Link>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
        <Box
          style={{
            borderRadius: "var(--mantine-radius-md)",
            overflow: "hidden",
            border: "1px solid var(--mantine-color-gray-3)",
          }}
        >
          <PartImage src={imageUrl(part.metadata)} alt={part.name} />
        </Box>
        <Stack gap="sm">
          <Group gap="xs">
            <TypeLabel isProduct={isProduct} />
          </Group>
          <Title order={1} size="h2">
            {part.name}
          </Title>
          <Text c="dimmed" ff="monospace">
            {part.sku}
          </Text>
          {part.description && <Text>{part.description}</Text>}
          <Group gap="sm" mt="sm">
            <StockStatus count={items.total} />
            <Text size="sm" c="dimmed">
              {unitsLabel(items.total)}
            </Text>
          </Group>
        </Stack>
      </SimpleGrid>

      <Section
        title="Inventory instances"
        description={
          items.total > items.data.length
            ? `Showing ${items.data.length} of ${items.total}`
            : undefined
        }
      >
        {items.data.length === 0 ? (
          <EmptyNote>No physical inventory for this SKU yet.</EmptyNote>
        ) : (
          <Box style={{ overflowX: "auto" }}>
            <Table verticalSpacing="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Serial number</TableTh>
                  <TableTh>Assembly state</TableTh>
                  <TableTh>Location</TableTh>
                  <TableTh>Status</TableTh>
                  <TableTh />
                </TableTr>
              </TableThead>
              <TableTbody>
                {items.data.map((item) => (
                  <TableTr key={item.id}>
                    <TableTd ff="monospace">
                      {item.serial_number ?? (
                        <Text size="sm" c="dimmed" component="span">
                          Unserialized
                        </Text>
                      )}
                    </TableTd>
                    <TableTd>{assemblyLabel(item.assembly_state)}</TableTd>
                    <TableTd>{item.location ?? "—"}</TableTd>
                    <TableTd>
                      {typeof item.metadata.status === "string"
                        ? item.metadata.status
                        : "Active"}
                    </TableTd>
                    <TableTd ta="right">
                      <Link
                        href={itemHref(part.sku, item.id)}
                        style={linkStyle}
                      >
                        <Text size="sm" component="span">
                          View
                        </Text>
                      </Link>
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </Box>
        )}
      </Section>

      {isProduct && (
        <Section
          title="Components / Bill of Materials"
          description="What this product should contain"
        >
          <div>
            <BomTree nodes={bom} />
          </div>
        </Section>
      )}
    </Stack>
  );
}
