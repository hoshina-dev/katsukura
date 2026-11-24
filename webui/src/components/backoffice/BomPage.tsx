import {
  Alert,
  Anchor,
  Box,
  Button,
  CloseButton,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconInfoCircle, IconPlus, IconSearch, IconSitemap } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import {
  bomHref,
  type CatalogEntry,
  type CatalogQuery,
  itemsLabel,
  LIST_PAGE_SIZE,
  parseBomCatalogQuery,
  type PartDetail,
  type SearchParams,
  skuHref,
} from "@/libs/inventory";
import { getCatalog, getPart, isMissing } from "@/libs/katsukuraApi";
import { Link, useRefreshToken, useRouter, useSearchParams } from "@/libs/nav";

import { BOM_LOCK_EXPLANATION, BomSection } from "./BomSection";
import {
  CatalogFiltersControl,
  clearedCatalogFilters,
  ClearCatalogFiltersButton,
} from "./CatalogFilters";
import { CatalogSortHeader, CatalogSortSelect } from "./CatalogSorting";
import { IdTag, PageHeader } from "./PageHeader";
import { Pager, useSearchParamUpdate } from "./Pager";
import { PartImage } from "./PartImage";

const bomSortFields = ["name", "price", "slots", "editing"] as const;

export function BomDirectory({ params }: { params: SearchParams }) {
  const { update } = useSearchParamUpdate();
  const query = useMemo(() => parseBomCatalogQuery(params), [params]);
  const starting = query.filters?.unit_type === "part" && query.filters.bom_editing === "editable";

  return (
    <Stack gap="md">
      <PageHeader
        title="Bill of materials"
        actions={
          <>
            <Button
              component={Link}
              href="/bom/graph"
              variant="default"
              leftSection={<IconSitemap size={16} />}
            >
              Dependency graph
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => update({
                ...clearedCatalogFilters(true),
                q: null,
                unit_type: "part",
                bom_editing: "editable",
              }, true, true)}
            >
              Start a BOM
            </Button>
          </>
        }
      />
      <Group justify="space-between" align="flex-start">
        <BomSearch search={query.search} />
        <CatalogSortSelect query={query} fields={bomSortFields} />
      </Group>
      <CatalogFiltersControl filters={query.filters} bom />
      <BomList query={query} starting={starting} />
    </Stack>
  );
}

function BomSearch({ search }: { search: string }) {
  const { update } = useSearchParamUpdate();
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);

  return (
    <Group
      component="form"
      gap="xs"
      wrap="nowrap"
      style={{ flex: "1 1 290px", maxWidth: 480 }}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() !== search) update({ q: draft.trim() }, true, true);
      }}
    >
      <TextInput
        aria-label="Search units"
        placeholder="Search name or SKU"
        leftSection={<IconSearch size={16} />}
        rightSection={
          draft && (
            <CloseButton
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setDraft("");
                if (search) update({ q: null }, true, true);
              }}
            />
          )
        }
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        style={{ flex: 1 }}
      />
      <Button type="submit" variant="default">
        Search
      </Button>
    </Group>
  );
}

function BomList({
  query,
  starting,
}: {
  query: CatalogQuery;
  starting: boolean;
}) {
  const { params, update } = useSearchParamUpdate();
  const token = useRefreshToken();
  const { page, search, filters } = query;
  const assemblies = filters?.unit_type === "assembly";
  const filtered = Object.keys(filters ?? {}).some((field) => field !== "unit_type") ||
    filters?.unit_type === "part";
  const queryKey = JSON.stringify(query);
  const [result, setResult] = useState<
    { key: string; entries: CatalogEntry[]; total: number } | { error: string }
  >();

  useEffect(() => {
    let current = true;
    getCatalog(query, LIST_PAGE_SIZE)
      .then((result) => {
        if (current) setResult({ ...result, key: queryKey });
      })
      .catch((error: unknown) => {
        if (current) {
          setResult({
            error: error instanceof Error ? error.message : "Could not load units",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [query, queryKey, token]);

  const pending = result && "key" in result && result.key !== queryKey;
  const total = result && "total" in result && !pending ? result.total : undefined;
  const lastPage =
    total === undefined ? page : Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  useEffect(() => {
    if (page > lastPage) {
      update({ page: lastPage > 1 ? String(lastPage) : null }, false);
    }
  }, [lastPage, page, update]);

  if (!result || page > lastPage)
    return <Skeleton height={180} aria-label="Loading units" />;
  if ("error" in result) return <BomLoadError message={result.error} />;

  if (result.entries.length === 0) {
    return (
      <Box className="panel" p="xl">
        <Stack gap="xs" align="center" ta="center">
          <Text fw={500}>
            {starting && !search
              ? "No units are ready for a new BOM"
              : search
                ? `No ${assemblies ? "assemblies" : "units"} match “${search}”`
                : filtered
                  ? "No units match these filters"
                  : assemblies
                    ? "No bills of materials yet"
                    : "No units yet"}
          </Text>
          {starting && (
            <>
              <Text size="sm" c="dimmed">
                A unit can get its first BOM when it has no components or inventory items.
              </Text>
              <Button component={Link} href="/units/new" variant="default" size="sm">
                New unit
              </Button>
            </>
          )}
          {filtered ? (
            <ClearCatalogFiltersButton bom />
          ) : assemblies && (
            <Button
              variant="subtle"
              onClick={() => update({ unit_type: "all", view: null }, true, true)}
            >
              Browse all units
            </Button>
          )}
        </Stack>
      </Box>
    );
  }

  const searchParams = params.toString();
  return (
    <Stack gap="md">
      {starting && !pending && (
        <Text size="sm" c="gray.7">Choose a unit to add its first BOM.</Text>
      )}
      <Box className="panel">
        <Table
          aria-label="BOM units"
          aria-busy={pending}
          highlightOnHover
          horizontalSpacing="md"
          verticalSpacing="sm"
        >
          <Table.Thead>
            <Table.Tr>
              <CatalogSortHeader label="Unit" field="name" query={query} />
              <CatalogSortHeader label="Price" field="price" query={query} ta="right" w={112} />
              <CatalogSortHeader label="Slots" field="slots" query={query} ta="right" w={96} visibleFrom="sm" />
              <CatalogSortHeader label="Editing" field="editing" query={query} w={165} visibleFrom="sm" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.entries.map((entry) => (
              <Table.Tr key={entry.id}>
                <Table.Td style={{ overflowWrap: "anywhere" }}>
                  <Anchor
                    component={Link}
                    href={bomHref(entry.id) + (searchParams ? `?${searchParams}` : "")}
                    display="block"
                    size="sm"
                    fw={500}
                  >
                    <Group gap="xs" wrap="nowrap">
                      <Box w={36} style={{ flexShrink: 0 }}>
                        <PartImage
                          key={entry.imageUrl}
                          src={entry.imageUrl}
                          alt=""
                          ratio={1}
                          radius="var(--mantine-radius-sm)"
                          iconSize={16}
                        />
                      </Box>
                      <Box miw={0}>
                        {entry.name}
                        <Text
                          component="span"
                          display="block"
                          size="xs"
                          c="gray.7"
                          ff="monospace"
                        >
                          {entry.sku}
                        </Text>
                      </Box>
                    </Group>
                  </Anchor>
                  <Stack hiddenFrom="sm" gap={2} mt={4} pl={44}>
                    <Text size="xs" c="gray.7">
                      {entry.componentCount}{" "}
                      {entry.componentCount === 1 ? "slot" : "slots"}
                    </Text>
                    <BomEditingStatus itemCount={entry.stock.total} />
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600} ta="right" className="tabular">
                    {entry.effectiveUnitPrice}
                  </Text>
                  <Text size="xs" c="gray.7" ta="right" style={{ whiteSpace: "nowrap" }}>
                    {priceLabel(entry.componentCount, entry.hasUnitPriceOverride)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right" visibleFrom="sm">
                  {entry.componentCount}
                </Table.Td>
                <Table.Td visibleFrom="sm">
                  <BomEditingStatus itemCount={entry.stock.total} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {pending ? (
        <Text size="sm" c="gray.7" role="status">Updating results…</Text>
      ) : lastPage > 1 ? (
        <Pager page={page} pageCount={lastPage} total={result.total} />
      ) : (
        <Text size="sm" c="gray.7">
          {result.total} {result.total === 1 ? "result" : "results"}
        </Text>
      )}
    </Stack>
  );
}

function priceLabel(componentCount: number, hasUnitPriceOverride: boolean) {
  return componentCount > 0 && !hasUnitPriceOverride
    ? "Composite price"
    : "Unit price";
}

function BomEditingStatus({ itemCount }: { itemCount: number }) {
  if (itemCount === 0) {
    return <Text size="sm" c="signal.9">Editable</Text>;
  }

  return (
    <Stack gap={2} align="flex-start">
      <Tooltip
        label={BOM_LOCK_EXPLANATION}
        multiline
        w={240}
        withArrow
        events={{ hover: true, focus: true, touch: true }}
      >
        <UnstyledButton
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "help",
          }}
        >
          <Text component="span" size="sm" c="gray.7">
            Locked
          </Text>
          <IconInfoCircle
            size={14}
            color="var(--mantine-color-gray-7)"
            aria-hidden="true"
          />
        </UnstyledButton>
      </Tooltip>
      <Text size="xs" c="gray.7">
        {itemsLabel(itemCount)} in inventory
      </Text>
    </Stack>
  );
}

export function BomDetail({ partId }: { partId: string }) {
  const search = useSearchParams().toString();
  const suffix = search ? `?${search}` : "";
  const listHref = `/bom${suffix}`;
  const token = useRefreshToken();
  const [result, setResult] = useState<PartDetail | { error: string } | null>();

  useEffect(() => {
    let current = true;
    getPart(partId)
      .then((part) => {
        if (current) setResult(part.archived_at ? null : part);
      })
      .catch((error: unknown) => {
        if (current) {
          setResult(
            isMissing(error)
              ? null
              : {
                  error:
                    error instanceof Error
                      ? error.message
                      : "Could not load this unit",
                },
          );
        }
      });
    return () => {
      current = false;
    };
  }, [partId, token]);

  const part = result && "id" in result ? result : undefined;
  return (
    <Stack gap="md">
      <PageHeader
        trail={[{ href: listHref, label: "Bill of materials" }]}
        title={part?.name ?? "Unit BOM"}
        meta={part && (
          <>
            <IdTag>{part.sku}</IdTag>
            <Text size="sm" c="gray.7">
              {priceLabel(part.components.length, part.unit_price != null)}{" "}
              <Text component="span" fw={600} c="dark.9" className="tabular">
                {part.effective_unit_price ??
                  part.unit_price ??
                  part.composite_price ??
                  "0.00"}
              </Text>
            </Text>
          </>
        )}
        actions={part && (
          <Button component={Link} href={skuHref(part.sku)} variant="default">
            Open unit
          </Button>
        )}
      />
      {result === undefined && (
        <Skeleton height={180} aria-label="Loading bill of materials" />
      )}
      {result === null && <Text c="dimmed">This unit could not be found.</Text>}
      {result && "error" in result && <BomLoadError message={result.error} />}
      {part && (
        <BomSection
          partId={part.id}
          components={part.components}
          itemCount={part.stock?.total ?? 0}
          assemblyHref={(id) => bomHref(id) + suffix}
        />
      )}
    </Stack>
  );
}

function BomLoadError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <Alert color="red" title="Could not load the bill of materials" role="alert">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{message}</Text>
        <Button size="xs" variant="default" onClick={() => router.refresh()}>
          Try again
        </Button>
      </Stack>
    </Alert>
  );
}
