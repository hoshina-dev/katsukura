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
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addItems, deleteItems } from "@/app/actions";
import {
  isPositiveInt,
  type Item,
  itemHref,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  serialLabel,
  itemsLabel,
} from "@/libs/inventory";

import { ConfirmModal } from "./ConfirmModal";
import { Pager } from "./Pager";
import { EmptyNote, Section } from "./Section";
import { TextLink } from "./TextLink";

interface InventoryInstancesProps {
  partId: string;
  sku: string;
  items: Item[];
  total: number;
  page: number;
}

export function InventoryInstances({
  partId,
  sku,
  items,
  total,
  page,
}: InventoryInstancesProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState<string | number>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / ITEMS_PAGE_SIZE));
  // The API enforces the upper limit and reports it as an error
  const validQuantity = isPositiveInt(quantity);
  const allSelected =
    items.length > 0 && items.every((item) => selected.has(item.id));

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error ?? null);
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
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
          loading={pending}
          onClick={() => run(() => addItems(partId, Number(quantity)))}
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
        {items.length === 0 ? (
          <EmptyNote>
            {total > 0
              ? "This page is past the last item. Go back a page."
              : "No physical items yet. Add items to give each one a serial number; they start with this unit's metadata."}
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
                  <TableTh>Location</TableTh>
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
                    <TableTd c={item.location ? undefined : "dimmed"}>
                      {item.location ?? "—"}
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
        {total > ITEMS_PAGE_SIZE && (
          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            param={ITEMS_PAGE_PARAM}
          />
        )}
      </Stack>
      <ConfirmModal
        opened={confirming}
        title={`Delete ${selected.size} ${selected.size === 1 ? "item" : "items"}?`}
        message="They are archived and removed from stock."
        confirmLabel="Delete"
        loading={pending}
        onConfirm={() => run(() => deleteItems([...selected]))}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
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
