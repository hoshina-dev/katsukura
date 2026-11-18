import { Badge, Grid, GridCol, Group, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { PageError } from "@/app/error";
import { saveItem } from "@/app/actions";
import { NotFound } from "@/app/not-found";
import {
  type Installation,
  imageUrls,
  type ItemDetail as ItemRecord,
  itemHref,
  type PartDetail,
  serialLabel,
  skuHref,
} from "@/libs/inventory";
import { getItem, getPart, isMissing } from "@/libs/katsukuraApi";
import { useRefreshToken } from "@/libs/nav";

import { DetailsEditor } from "./DetailsEditor";
import { InstalledComponents } from "./InstalledComponents";
import { IdTag, PageHeader } from "./PageHeader";
import { PartGallery } from "./PartGallery";
import { Section } from "./Section";
import { TextLink } from "./TextLink";

export function ItemDetail({ itemId }: { itemId: string }) {
  const token = useRefreshToken();
  const seen = useRef(itemId);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "error"; message: string }
    | { status: "ready"; item: ItemRecord; part: PartDetail }
  >({ status: "loading" });

  useEffect(() => {
    let cancel = false;
    if (seen.current !== itemId) {
      seen.current = itemId;
      setState({ status: "loading" });
    }
    getItem(itemId)
      .then(async (item) => {
        if (cancel) return;
        const part = await getPart(item.part_id);
        if (!cancel) setState({ status: "ready", item, part });
      })
      .catch((error: unknown) => {
        if (cancel) return;
        if (isMissing(error)) setState({ status: "missing" });
        else {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load this item",
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [itemId, token]);

  if (state.status === "loading") {
    return (
      <Stack gap="md">
        <Skeleton height={28} width={240} />
        <Skeleton height={220} />
      </Stack>
    );
  }
  if (state.status === "missing") return <NotFound />;
  if (state.status === "error") return <PageError message={state.message} />;
  return <ItemBody item={state.item} part={state.part} />;
}

function ItemBody({ item, part }: { item: ItemRecord; part: PartDetail }) {
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
        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            {images.length > 0 && (
              <PartGallery images={images} alt={part.name} />
            )}
            <DetailsEditor
              title="Details"
              metadata={item.metadata}
              save={saveItem.bind(null, item.id)}
            />
          </Stack>
        </GridCol>
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
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
            {item.history.length > 0 && <Removed rows={item.history} />}
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Components taken out by a replace or a delete, newest first
function Removed({ rows }: { rows: Installation[] }) {
  return (
    <Section title="Removed components">
      <Stack gap={0}>
        {rows.map((row) => (
          <Group
            key={row.id}
            justify="space-between"
            py={6}
            style={{ borderTop: "1px solid var(--app-line)" }}
          >
            <Group gap="xs" wrap="nowrap" miw={0}>
              <TextLink
                href={itemHref(
                  row.component_item?.part?.sku ?? "",
                  row.component_item_id,
                )}
                ff="monospace"
              >
                {serialLabel(row.component_item)}
              </TextLink>
              <Text size="sm" c="dimmed" truncate>
                {row.component_item?.part?.name}
              </Text>
            </Group>
            {row.removed_at && (
              <Text size="xs" c="dimmed" className="tabular">
                Removed {dateTime.format(new Date(row.removed_at))}
              </Text>
            )}
          </Group>
        ))}
      </Stack>
    </Section>
  );
}
