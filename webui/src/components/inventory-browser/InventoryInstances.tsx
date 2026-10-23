"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addItems, deleteItems } from "@/app/backoffice/actions";
import {
  type Item,
  itemHref,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  unitsLabel,
} from "@/libs/inventory";

import { CatalogPager } from "./CatalogControls";
import { ConfirmModal } from "./ConfirmModal";
import { EmptyNote, Section } from "./Section";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

interface InventoryInstancesProps {
  partId: string;
  sku: string;
  items: Item[];
  total: number;
  page: number;
  // Backoffice: add items, select rows, and delete them
  editable?: boolean;
}

export function InventoryInstances({
  partId,
  sku,
  items,
  total,
  page,
  editable,
}: InventoryInstancesProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState<string | number>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / ITEMS_PAGE_SIZE));
  const count = Number(quantity);
  // The API enforces the upper limit and reports it as an error
  const validQuantity = Number.isInteger(count) && count >= 1;
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

  const actions = editable && (
    <>
      <NumberInput
        aria-label="Number of items to add"
        value={quantity}
        onChange={setQuantity}
        min={1}
        allowDecimal={false}
        allowNegative={false}
        w={90}
      />
      <Button
        leftSection={<IconPlus size={16} />}
        disabled={!validQuantity}
        loading={pending}
        onClick={() => run(() => addItems(partId, count))}
      >
        Add
      </Button>
      <Checkbox
        label="Select all"
        checked={allSelected}
        indeterminate={!allSelected && selected.size > 0}
        disabled={items.length === 0}
        onChange={() =>
          setSelected(
            allSelected ? new Set() : new Set(items.map((item) => item.id)),
          )
        }
      />
      <Button
        color="red"
        variant="light"
        leftSection={<IconTrash size={16} />}
        disabled={selected.size === 0}
        onClick={() => setConfirming(true)}
      >
        Delete{selected.size > 0 ? ` (${selected.size})` : ""}
      </Button>
    </>
  );

  return (
    <Section
      title="Inventory instances"
      description={total > 0 ? unitsLabel(total) : undefined}
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
              ? "This page is empty. Go back to the previous page."
              : "No physical inventory for this SKU yet."}
          </EmptyNote>
        ) : (
          <Box style={{ overflowX: "auto" }}>
            <Table verticalSpacing="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Serial number</TableTh>
                  <TableTh>Location</TableTh>
                  <TableTh />
                  {editable && <TableTh w={40} />}
                </TableTr>
              </TableThead>
              <TableTbody>
                {items.map((item) => (
                  <TableTr key={item.id}>
                    <TableTd ff="monospace">
                      {item.serial_number ?? (
                        <Text size="sm" c="dimmed" component="span">
                          Unserialized
                        </Text>
                      )}
                    </TableTd>
                    <TableTd>{item.location ?? "—"}</TableTd>
                    <TableTd ta="right">
                      <Link
                        href={itemHref(
                          sku,
                          item.id,
                          editable ? "/backoffice" : "/inventory",
                        )}
                        style={linkStyle}
                      >
                        <Text size="sm" component="span">
                          View
                        </Text>
                      </Link>
                    </TableTd>
                    {editable && (
                      <TableTd>
                        <Checkbox
                          aria-label={`Select ${item.serial_number ?? item.id}`}
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                      </TableTd>
                    )}
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </Box>
        )}
        {total > ITEMS_PAGE_SIZE && (
          <CatalogPager
            page={page}
            pageCount={pageCount}
            total={total}
            param={ITEMS_PAGE_PARAM}
          />
        )}
      </Stack>
      {editable && (
        <ConfirmModal
          opened={confirming}
          title="Delete items"
          message={`Delete ${selected.size} selected ${selected.size === 1 ? "item" : "items"}? They are archived and removed from inventory.`}
          confirmLabel="Delete"
          loading={pending}
          onConfirm={() => run(() => deleteItems([...selected]))}
          onClose={() => setConfirming(false)}
        />
      )}
    </Section>
  );
}
