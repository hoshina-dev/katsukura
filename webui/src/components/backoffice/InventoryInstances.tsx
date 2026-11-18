"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useRouter } from "@/libs/nav";
import { useEffect, useRef, useState, useTransition } from "react";

import { addItems, deleteItems } from "@/app/actions";
import {
  isPositiveInt,
  type Item,
  itemHref,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  ITEMS_SEARCH_PARAM,
  type PartComponent,
  serialLabel,
  itemsLabel,
} from "@/libs/inventory";

import { AddItemsModal } from "./AddItemsModal";
import { ConfirmModal } from "./ConfirmModal";
import { Pager, useSearchParamUpdate } from "./Pager";
import { EmptyNote, Section } from "./Section";
import { TextLink } from "./TextLink";

interface InventoryInstancesProps {
  partId: string;
  sku: string;
  items: Item[];
  total: number;
  page: number;
  // Serial number filter from the address
  search: string;
  // The unit's BOM rows, with child_part and its stock loaded
  slots: PartComponent[];
  serialAware?: boolean;
}

export function InventoryInstances({
  partId,
  sku,
  items,
  total,
  page,
  search,
  slots,
  serialAware = true,
}: InventoryInstancesProps) {
  const router = useRouter();
  const { update } = useSearchParamUpdate();
  const [query, setQuery] = useState(search);
  const [debounced] = useDebouncedValue(query.trim(), 300);
  const written = useRef(search);
  const [quantity, setQuantity] = useState<string | number>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Selections are per page and per search
  useEffect(() => setSelected(new Set()), [page, search]);

  useEffect(() => {
    if (debounced === written.current) return;
    written.current = debounced;
    update(
      { [ITEMS_SEARCH_PARAM]: debounced || null, [ITEMS_PAGE_PARAM]: null },
      false,
    );
  }, [debounced, update]);

  const pageCount = Math.max(1, Math.ceil(total / ITEMS_PAGE_SIZE));
  // The API enforces the upper limit and reports it as an error
  const validQuantity = isPositiveInt(quantity);
  const allSelected =
    items.length > 0 && items.every((item) => selected.has(item.id));

  const remove = () =>
    startTransition(async () => {
      const ids = [...selected];
      const result = await deleteItems(ids);
      const failed = items.filter((item) => result.failed.includes(item.id));
      setError(result.error ? deleteError(result.error, failed) : null);
      // Failed rows stay selected so they can be dealt with and retried
      setSelected(new Set(result.failed));
      setConfirming(false);
      router.refresh();
    });

  const add = (serialNumbers: string[]) =>
    startTransition(async () => {
      const count = Number(quantity);
      const result = await addItems(
        partId,
        count,
        serialAware ? serialNumbers : undefined,
      );
      setAddError(result.error ?? null);
      if (!result.error) {
        setAdding(false);
        router.refresh();
      }
    });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const actions =
    selected.size > 0 ? (
      <>
        <Text size="sm" c="dimmed" className="tabular">
          {selected.size} selected
        </Text>
        <Button
          size="xs"
          variant="default"
          onClick={() => setSelected(new Set())}
        >
          Clear
        </Button>
        <Button
          size="xs"
          color="red"
          variant="light"
          leftSection={<IconTrash size={14} />}
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      </>
    ) : (
      <Group gap={6} wrap="nowrap">
        <NumberInput
          aria-label="Number of items to add"
          value={quantity}
          onChange={setQuantity}
          min={1}
          allowDecimal={false}
          allowNegative={false}
          size="xs"
          w={64}
        />
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          disabled={!validQuantity}
          onClick={() => {
            setAddError(null);
            setAdding(true);
          }}
        >
          Add {Number(quantity) === 1 ? "item" : "items"}
        </Button>
      </Group>
    );

  return (
    <Section
      title="Items"
      description={total > 0 ? itemsLabel(total) : undefined}
      actions={actions}
      collapsible
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {serialAware && (total > 0 || search) && (
          <TextInput
            aria-label="Search items by serial number"
            placeholder="Search serial number"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            size="xs"
            maw={280}
          />
        )}
        {items.length === 0 ? (
          <EmptyNote>
            {search
              ? `No items match “${search}”.`
              : serialAware
                ? "No physical items yet. Add items to give each one a serial number; they start with this unit's metadata."
                : "No physical items yet. Add items to track stock; they start with this unit's metadata."}
          </EmptyNote>
        ) : (
          <Box style={{ overflowX: "auto" }} mx="-md">
            <Table
              verticalSpacing={8}
              horizontalSpacing="md"
              highlightOnHover
              miw={560}
            >
              <TableThead>
                <TableTr>
                  <TableTh w={40}>
                    <Checkbox
                      aria-label="Select all on this page"
                      size="xs"
                      checked={allSelected}
                      indeterminate={!allSelected && selected.size > 0}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(items.map((item) => item.id)),
                        )
                      }
                    />
                  </TableTh>
                  <TableTh>Serial number</TableTh>
                  <TableTh>Installed in</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {items.map((item) => (
                  <TableTr
                    key={item.id}
                    bg={selected.has(item.id) ? "signal.0" : undefined}
                  >
                    <TableTd>
                      <Checkbox
                        size="xs"
                        aria-label={`Select ${item.serial_number ?? item.id}`}
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </TableTd>
                    <TableTd>
                      <TextLink href={itemHref(sku, item.id)} ff="monospace">
                        {serialLabel(item)}
                      </TextLink>
                    </TableTd>
                    <TableTd>
                      <InstalledIn item={item} />
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </Box>
        )}
        {(total > ITEMS_PAGE_SIZE || page > 1) && (
          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            param={ITEMS_PAGE_PARAM}
          />
        )}
      </Stack>
      {adding && (
        <AddItemsModal
          count={Number(quantity)}
          slots={slots}
          serialAware={serialAware}
          loading={pending}
          error={addError}
          onSubmit={add}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmModal
        opened={confirming}
        title={`Delete ${selected.size} ${selected.size === 1 ? "item" : "items"}?`}
        message={deleteMessage(items.filter((item) => selected.has(item.id)))}
        confirmLabel="Delete"
        loading={pending}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
}

function parentLabel(item: Item) {
  const parent = item.parent?.parent_item;
  if (!parent) return null;
  const name = parent.part?.name ?? "another item";
  return parent.serial_number ? `${name} ${parent.serial_number}` : name;
}

function deleteMessage(selected: Item[]) {
  const installed = selected.filter((item) => item.parent?.parent_item);
  const base = "They are archived and removed from stock.";
  if (installed.length === 0) return base;
  const names = installed
    .map((item) => `${serialLabel(item)} (in ${parentLabel(item)})`)
    .join(", ");
  return `${base} Installed items can't be deleted and will stay selected: ${names}. Replace them on their parent item's page, or delete that item first.`;
}

// Names the parent of each installed row that failed
function deleteError(summary: string, failed: Item[]) {
  const installed = failed.filter((item) => item.parent?.parent_item);
  if (installed.length === 0) return summary;
  const names = installed
    .map((item) => `${serialLabel(item)} is installed in ${parentLabel(item)}`)
    .join("; ");
  return `${summary}. ${names}. Replace it on that item's page, or delete that item first.`;
}

// Link to the item this one is installed in, or a dash when it is free
function InstalledIn({ item }: { item: Item }) {
  const parent = item.parent?.parent_item;
  if (!parent) {
    return (
      <Text size="sm" c="dimmed" component="span">
        Available
      </Text>
    );
  }
  return (
    <TextLink href={itemHref(parent.part?.sku ?? "", parent.id)}>
      {parent.part?.name ?? serialLabel(parent)}
      {parent.serial_number && (
        <Text span size="xs" c="dimmed" ff="monospace" ml={6}>
          {parent.serial_number}
        </Text>
      )}
    </TextLink>
  );
}
