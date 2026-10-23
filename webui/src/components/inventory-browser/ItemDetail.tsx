import {
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

import { assemblyLabel, imageUrls, itemHref, skuHref } from "@/libs/inventory";
import { getItem, getItemTree, getPart, isMissing } from "@/libs/papiRest";

import { InstalledComponents } from "./InstalledComponents";
import { ItemEditor } from "./ItemEditor";
import { Field, MetadataSection } from "./Metadata";
import { PartGallery } from "./PartGallery";
import { EmptyNote, Section } from "./Section";
import { InstalledTree } from "./Trees";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

interface ItemDetailProps {
  itemId: string;
  // Backoffice: edit the item and install or remove components
  editable?: boolean;
}

// Item page shared by /inventory (browse) and /backoffice (edit). The public
// page only shows items the API reports as viewable.
export async function ItemDetail({ itemId, editable }: ItemDetailProps) {
  const base = editable ? "/backoffice" : "/inventory";
  const [item, tree] = await Promise.all([
    getItem(itemId, !editable),
    getItemTree(itemId),
  ]).catch((error) => {
    if (isMissing(error)) notFound();
    throw error;
  });
  const part = await getPart(item.part_id);

  const installedCount = (componentId: string) =>
    item.components.filter((row) => row.part_component_id === componentId)
      .length;
  const parentItem = item.parent?.parent_item;
  const images = imageUrls(item.metadata);

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href={base} style={linkStyle}>
          <Text size="sm" component="span">
            {editable ? "Inventory management" : "Inventory"}
          </Text>
        </Link>
        <Link href={skuHref(part.sku, base)} style={linkStyle}>
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

      {images.length > 0 && (
        <Box
          maw={560}
          style={{
            borderRadius: "var(--mantine-radius-md)",
            overflow: "hidden",
            border: "1px solid var(--mantine-color-gray-3)",
          }}
        >
          <PartGallery images={images} alt={part.name} />
        </Box>
      )}

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
                href={itemHref(
                  parentItem.part?.sku ?? part.sku,
                  parentItem.id,
                  base,
                )}
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
      </Section>

      {editable ? (
        <ItemEditor
          itemId={item.id}
          location={item.location}
          assemblyState={item.assembly_state}
          metadata={item.metadata}
        />
      ) : (
        <MetadataSection metadata={item.metadata} />
      )}

      {editable ? (
        part.components.length > 0 && (
          <InstalledComponents
            parentItemId={item.id}
            slots={part.components}
            installations={item.components}
          />
        )
      ) : (
        <Section
          title="Installed components"
          description="Physical items actually attached to this unit"
        >
          {tree.children.length === 0 ? (
            <EmptyNote>No components installed.</EmptyNote>
          ) : (
            <div>
              <InstalledTree nodes={tree.children} base={base} />
            </div>
          )}
        </Section>
      )}

      {!editable && part.components.length > 0 && (
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
                          <Link
                            href={skuHref(child.sku, base)}
                            style={linkStyle}
                          >
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
