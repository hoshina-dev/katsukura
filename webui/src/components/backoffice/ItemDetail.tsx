import {
  Badge,
  Grid,
  GridCol,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notFound } from "next/navigation";

import { saveItem } from "@/app/actions";
import { imageUrls, itemHref, serialLabel, skuHref } from "@/libs/inventory";
import { getItem, getPart, isMissing } from "@/libs/papiRest";

import { DetailsEditor } from "./DetailsEditor";
import { InstalledComponents } from "./InstalledComponents";
import { IdTag, PageHeader } from "./PageHeader";
import { PartGallery } from "./PartGallery";
import { TextLink } from "./TextLink";

export async function ItemDetail({ itemId }: { itemId: string }) {
  const item = await getItem(itemId).catch((error) => {
    if (isMissing(error)) notFound();
    throw error;
  });
  const part = await getPart(item.part_id);
  const parentItem = item.parent?.parent_item;
  const images = imageUrls(item.metadata);

  return (
    <Stack gap="lg">
      <PageHeader
        trail={[
          { href: "/", label: "Units" },
          { href: skuHref(part.sku), label: part.name },
        ]}
        title={serialLabel(item)}
        meta={
          <>
            <IdTag>{part.sku}</IdTag>
            {item.archived_at && (
              <Badge color="gray" variant="light" radius="sm">
                Deleted
              </Badge>
            )}
            <Text size="sm" c="dimmed">
              {parentItem ? (
                <>
                  Installed in{" "}
                  <TextLink
                    href={itemHref(
                      parentItem.part?.sku ?? part.sku,
                      parentItem.id,
                    )}
                  >
                    {parentItem.part?.name ?? serialLabel(parentItem)}
                    {parentItem.serial_number &&
                      ` · ${parentItem.serial_number}`}
                  </TextLink>
                </>
              ) : (
                "Available, not installed"
              )}
            </Text>
          </>
        }
      />

      <Grid gutter="md">
        <GridCol span={{ base: 12, lg: 8 }}>
          {part.components.length > 0 ? (
            <InstalledComponents
              parentItemId={item.id}
              slots={part.components}
              installations={item.components}
            />
          ) : (
            <Text size="sm" c="dimmed" className="panel" p="md">
              {part.name} has no bill of materials, so this item holds no
              components.
            </Text>
          )}
        </GridCol>
        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            {images.length > 0 && (
              <PartGallery images={images} alt={part.name} />
            )}
            <DetailsEditor
              title="Details"
              field={
                <TextInput
                  name="value"
                  label="Location"
                  defaultValue={item.location ?? ""}
                />
              }
              metadata={item.metadata}
              save={saveItem.bind(null, item.id)}
            />
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}
