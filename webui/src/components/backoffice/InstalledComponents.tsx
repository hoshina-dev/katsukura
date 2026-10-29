"use client";

import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Radio,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { findAvailableItems, replaceItem } from "@/app/actions";
import {
  type Installation,
  type Item,
  itemHref,
  type PartComponent,
  serialLabel,
  skuHref,
} from "@/libs/inventory";

import { TextLink } from "./TextLink";
import { errorLines } from "./Metadata";
import { EmptyNote, Section } from "./Section";

interface InstalledComponentsProps {
  parentItemId: string;
  // The parent SKU's BOM rows, with child_part loaded
  slots: PartComponent[];
  // Active installations, with component_item loaded
  installations: Installation[];
}

// Backoffice: the item's components per BOM slot; each can be swapped for an
// available item of the same SKU
export function InstalledComponents({
  parentItemId,
  slots,
  installations,
}: InstalledComponentsProps) {
  const [replacing, setReplacing] = useState<{
    installation: Installation;
    slot: PartComponent;
  } | null>(null);

  return (
    <Section
      title="Installed components"
      description="Replace an item to swap in one from stock"
    >
      <Stack gap="lg">
        {slots.map((slot) => {
          const rows = installations.filter(
            (row) => row.part_component_id === slot.id,
          );
          const child = slot.child_part;
          const short = rows.length < slot.required_quantity;
          return (
            <div key={slot.id}>
              <Group justify="space-between" wrap="nowrap" mb={4}>
                <Group gap="xs" wrap="nowrap" miw={0}>
                  {child ? (
                    <TextLink href={skuHref(child.sku)} fw={500}>
                      {child.name}
                    </TextLink>
                  ) : (
                    <Text size="sm" fw={500}>
                      {slot.child_part_id}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed" ff="monospace">
                    {slot.slot}
                  </Text>
                </Group>
                <Text
                  size="sm"
                  className="tabular"
                  c={short ? "orange.9" : "dimmed"}
                  fw={short ? 500 : undefined}
                >
                  {rows.length} of {slot.required_quantity} installed
                </Text>
              </Group>
              {rows.map((row) => (
                <Group
                  key={row.id}
                  justify="space-between"
                  py={6}
                  style={{ borderTop: "1px solid var(--app-line)" }}
                >
                  <TextLink
                    href={itemHref(
                      row.component_item?.part?.sku ?? child?.sku ?? "",
                      row.component_item_id,
                    )}
                    ff="monospace"
                  >
                    {serialLabel(row.component_item)}
                  </TextLink>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setReplacing({ installation: row, slot })}
                  >
                    Replace
                  </Button>
                </Group>
              ))}
            </div>
          );
        })}
      </Stack>
      {replacing && (
        <ReplacePicker
          parentItemId={parentItemId}
          installation={replacing.installation}
          slot={replacing.slot}
          onClose={() => setReplacing(null)}
        />
      )}
    </Section>
  );
}

interface ReplacePickerProps {
  parentItemId: string;
  installation: Installation;
  slot: PartComponent;
  onClose: () => void;
}

// Lists items of the slot's SKU that are not installed anywhere
function ReplacePicker({
  parentItemId,
  installation,
  slot,
  onClose,
}: ReplacePickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    findAvailableItems(slot.child_part_id, debounced).then((result) => {
      if (!current) return;
      setItems(result.items);
      setTotal(result.total);
    });
    return () => {
      current = false;
    };
  }, [slot.child_part_id, debounced, reload]);

  const replace = () =>
    selected &&
    startTransition(async () => {
      const lines = errorLines(
        await replaceItem(parentItemId, installation.id, selected),
      );
      router.refresh();
      if (lines.length === 0) {
        onClose();
        return;
      }
      // The item was taken elsewhere meanwhile: show why and reload the list
      setError(lines.join("; "));
      setSelected(null);
      setReload((value) => value + 1);
    });

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Replace ${installation.component_item?.serial_number ?? "component"}`}
      size="lg"
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Choose an available {slot.child_part?.name ?? "item"}. The current
          item goes back to stock.
        </Text>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <TextInput
          aria-label="Search by serial number"
          placeholder="Search by serial number..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {items === null ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : items.length === 0 ? (
          <EmptyNote>No available items of this SKU.</EmptyNote>
        ) : (
          <ScrollArea.Autosize mah={320}>
            <Radio.Group value={selected} onChange={setSelected}>
              <Stack gap={6}>
                {items.map((item) => (
                  <Radio
                    key={item.id}
                    value={item.id}
                    label={
                      <Text size="sm" ff="monospace" component="span">
                        {serialLabel(item)}
                        {item.location ? ` · ${item.location}` : ""}
                      </Text>
                    }
                  />
                ))}
              </Stack>
            </Radio.Group>
          </ScrollArea.Autosize>
        )}
        {total > (items?.length ?? 0) && (
          <Text size="xs" c="dimmed">
            Showing {items?.length} of {total}; search to narrow down.
          </Text>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected} loading={pending} onClick={replace}>
            Replace
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
