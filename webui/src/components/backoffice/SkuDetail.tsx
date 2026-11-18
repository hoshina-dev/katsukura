import { Grid, GridCol, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { PageError } from "@/app/error";
import { savePart } from "@/app/actions";
import { NotFound } from "@/app/not-found";
import {
  imageUrls,
  type Item,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  ITEMS_SEARCH_PARAM,
  type List,
  pageParam,
  type PartComponent,
  type PartDetail,
  type SearchParams,
  skuHref,
  textParam,
} from "@/libs/inventory";
import { findPartBySku, listItems } from "@/libs/katsukuraApi";
import { navigate, useRefreshToken } from "@/libs/nav";

import { BomSection } from "./BomSection";
import { DetailsEditor } from "./DetailsEditor";
import { InventoryInstances } from "./InventoryInstances";
import { IdTag, PageHeader } from "./PageHeader";
import { PartGallery } from "./PartGallery";
import { Section } from "./Section";
import { StockCounts } from "./StockCounts";
import { TextLink } from "./TextLink";

type Loaded = {
  part: PartDetail;
  items: List<Item>;
  page: number;
  search: string;
};

export function SkuDetail({
  sku,
  params,
}: {
  sku: string;
  params: SearchParams;
}) {
  const token = useRefreshToken();
  const queryKey = JSON.stringify([sku, params]);
  const seen = useRef(queryKey);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "error"; message: string }
    | { status: "ready"; data: Loaded }
  >({ status: "loading" });

  useEffect(() => {
    let cancel = false;
    if (seen.current !== queryKey) {
      seen.current = queryKey;
      setState({ status: "loading" });
    }
    const page = pageParam(params, ITEMS_PAGE_PARAM);
    const search = textParam(params, ITEMS_SEARCH_PARAM);
    findPartBySku(sku)
      .then(async (part) => {
        if (cancel) return;
        if (!part) {
          setState({ status: "missing" });
          return;
        }
        const items = await listItems(part.id, {
          limit: ITEMS_PAGE_SIZE,
          offset: (page - 1) * ITEMS_PAGE_SIZE,
          search: search || undefined,
        });
        if (cancel) return;
        const lastPage = Math.max(1, Math.ceil(items.total / ITEMS_PAGE_SIZE));
        // e.g. the only row on the last page was deleted
        if (items.data.length === 0 && page > lastPage) {
          const next = new URLSearchParams();
          if (search) next.set(ITEMS_SEARCH_PARAM, search);
          if (lastPage > 1) next.set(ITEMS_PAGE_PARAM, String(lastPage));
          const query = next.toString();
          navigate(skuHref(part.sku) + (query ? `?${query}` : ""), true);
          return;
        }
        setState({ status: "ready", data: { part, items, page, search } });
      })
      .catch((error: unknown) => {
        if (!cancel) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load this unit",
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [queryKey, token, sku, params]);

  if (state.status === "loading") return <Pending />;
  if (state.status === "missing") return <NotFound />;
  if (state.status === "error") return <PageError message={state.message} />;
  return <SkuBody {...state.data} />;
}

function Pending() {
  return (
    <Stack gap="md">
      <Skeleton height={28} width={240} />
      <Skeleton height={220} />
    </Stack>
  );
}

function SkuBody({ part, items, page, search }: Loaded) {
  const images = imageUrls(part.metadata);
  // Deleted parents keep their BOM rows but no longer use this unit
  const usedIn = part.parents.filter(
    (row) => row.parent_part && !row.parent_part.archived_at,
  );

  return (
    <Stack gap="lg">
      <PageHeader
        trail={[{ href: "/", label: "Units" }]}
        title={part.name}
        meta={
          <>
            <IdTag>{part.sku}</IdTag>
            {part.stock && <StockCounts stock={part.stock} />}
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
              name={part.name}
              text={{ label: "Description", value: part.description }}
              metadata={part.metadata}
              prices={{
                compositePrice: part.composite_price ?? "0.00",
                unitPrice: part.unit_price,
                editableComposite: part.components.length === 0,
              }}
              save={savePart.bind(null, part.id)}
            />
          </Stack>
        </GridCol>
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <InventoryInstances
              partId={part.id}
              sku={part.sku}
              items={items.data}
              total={items.total}
              page={page}
              search={search}
              slots={part.components}
            />
            <BomSection
              partId={part.id}
              components={part.components}
              locked={(part.stock?.total ?? 0) > 0}
            />
            {usedIn.length > 0 && <UsedIn rows={usedIn} />}
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}

// Units whose bill of materials includes this one
function UsedIn({ rows }: { rows: PartComponent[] }) {
  return (
    <Section title="Used in">
      <Stack gap={6}>
        {rows.map((row) =>
          row.parent_part ? (
            <Text key={row.id} size="sm">
              <TextLink href={skuHref(row.parent_part.sku)}>
                {row.parent_part.name}
              </TextLink>
              <Text span size="xs" c="dimmed" ff="monospace" ml={8}>
                {row.slot} × {row.required_quantity}
              </Text>
            </Text>
          ) : null,
        )}
      </Stack>
    </Section>
  );
}
