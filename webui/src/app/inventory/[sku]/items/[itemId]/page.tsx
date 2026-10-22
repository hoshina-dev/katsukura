import {
  Anchor,
  Box,
  Breadcrumbs,
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
import type { ReactNode } from "react";

import { EmptyNote, Section } from "@/components/inventory-browser/Section";
import { InstalledTree } from "@/components/inventory-browser/Trees";
import { assemblyLabel, itemHref, skuHref } from "@/libs/inventory";
import { getItem, getItemTree, getPart, isMissing } from "@/libs/papiRest";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  );
}

function formatValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ sku: string; itemId: string }>;
}) {
  const { itemId } = await params;
  const [item, tree] = await Promise.all([
    getItem(itemId),
    getItemTree(itemId),
  ]).catch((error) => {
    if (isMissing(error)) notFound();
    throw error;
  });
  const part = await getPart(item.part_id);

  const installedCount = (componentId: string) =>
    item.components.filter(
      (row) => row.part_component_id === componentId && !row.removed_at,
    ).length;
  const parentItem = item.parent?.parent_item;
  const metadata = Object.entries(item.metadata);

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/inventory" style={linkStyle}>
          <Text size="sm" component="span">
            Inventory
          </Text>
        </Link>
        <Link href={skuHref(part.sku)} style={linkStyle}>
          <Text size="sm" component="span">
            {part.name}
          </Text>
        </Link>
        <Text size="sm" c="dimmed">
          {item.serial_number ?? "Unserialized"}
        </Text>
      </Breadcrumbs>

      <div>
        <Title order={1} size="h2">
          {part.name}
        </Title>
        <Text c="dimmed" ff="monospace">
          {part.sku}
        </Text>
      </div>

      <Section title="Item details">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="lg">
          <Field label="Serial number">
            {item.serial_number ?? "Unserialized"}
          </Field>
          <Field label="Assembly state">
            {assemblyLabel(item.assembly_state)}
          </Field>
          <Field label="Location">{item.location ?? "—"}</Field>
          <Field label="Installed in">
            {parentItem ? (
              <Link
                href={itemHref(parentItem.part?.sku ?? part.sku, parentItem.id)}
                style={linkStyle}
              >
                {parentItem.part?.name ??
                  parentItem.serial_number ??
                  "Parent item"}
              </Link>
            ) : (
              "—"
            )}
          </Field>
        </SimpleGrid>
        {metadata.length > 0 && (
          <Box style={{ overflowX: "auto" }}>
            <Table verticalSpacing={6}>
              <TableTbody>
                {metadata.map(([key, value]) => (
                  <TableTr key={key}>
                    <TableTd w={200}>
                      <Text size="sm" c="dimmed">
                        {key}
                      </Text>
                    </TableTd>
                    <TableTd style={{ wordBreak: "break-all" }}>
                      {typeof value === "string" &&
                      /^https?:\/\//.test(value) ? (
                        <Anchor
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          size="sm"
                        >
                          {value}
                        </Anchor>
                      ) : (
                        <Text size="sm">{formatValue(value)}</Text>
                      )}
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </Box>
        )}
      </Section>

      <Section
        title="Installed components"
        description="Physical items actually attached to this unit"
      >
        {tree.children.length === 0 ? (
          <EmptyNote>No components installed.</EmptyNote>
        ) : (
          <div>
            <InstalledTree nodes={tree.children} />
          </div>
        )}
      </Section>

      {part.components.length > 0 && (
        <Section
          title="Schematic"
          description="Components this product should contain"
        >
          <Box style={{ overflowX: "auto" }}>
            <Table verticalSpacing="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Component</TableTh>
                  <TableTh>Slot</TableTh>
                  <TableTh>Required</TableTh>
                  <TableTh>Installed</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {part.components.map((component) => {
                  const installed = installedCount(component.id);
                  const child = component.child_part;
                  return (
                    <TableTr key={component.id}>
                      <TableTd>
                        {child ? (
                          <Link href={skuHref(child.sku)} style={linkStyle}>
                            <Text size="sm" component="span">
                              {child.name}
                            </Text>
                          </Link>
                        ) : (
                          component.child_part_id.slice(0, 8)
                        )}
                      </TableTd>
                      <TableTd>
                        <Text size="sm" c="dimmed" ff="monospace">
                          {component.slot}
                        </Text>
                      </TableTd>
                      <TableTd>
                        {component.required_quantity}
                        {component.is_optional ? " (optional)" : ""}
                      </TableTd>
                      <TableTd>
                        <Text
                          size="sm"
                          c={
                            installed >= component.required_quantity
                              ? "green.7"
                              : "dimmed"
                          }
                        >
                          {installed} / {component.required_quantity}
                        </Text>
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </Box>
        </Section>
      )}
    </Stack>
  );
}
