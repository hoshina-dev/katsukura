"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  findAvailableItems,
  installItems,
  uninstallItem,
} from "@/app/backoffice/actions";
import {
  assemblyLabel,
  type Installation,
  type Item,
  itemHref,
  type PartComponent,
  skuHref,
} from "@/libs/inventory";

import { EmptyNote, Section } from "./Section";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

interface InstalledComponentsProps {
  parentItemId: string;
  // The parent SKU's BOM rows, with child_part loaded
  slots: PartComponent[];
  // Active installations, with component_item loaded
  installations: Installation[];
}

// Backoffice: install and remove components, one BOM slot at a time
export function InstalledComponents({
  parentItemId,
  slots,
  installations,
}: InstalledComponentsProps) {
  const router = useRouter();
  const [picking, setPicking] = useState<PartComponent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const installedIn = (slotId: string) =>
    installations.filter((row) => row.part_component_id === slotId);

  const remove = (installationId: string) =>
    startTransition(async () => {
      const result = await uninstallItem(parentItemId, installationId);
      setError(result.error ?? null);
      router.refresh();
    });

  return (
    <Section
      title="Installed components"
      description="Fill each slot with physical items of the required SKU"
    >
      <Stack gap="lg">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {slots.length === 0 && (
          <EmptyNote>This SKU has no bill of materials.</EmptyNote>
        )}
        {slots.map((slot) => {
          const rows = installedIn(slot.id);
          const full = rows.length >= slot.required_quantity;
          const child = slot.child_part;
          return (
            <Stack key={slot.id} gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {child ? (
                    <Link
                      href={skuHref(child.sku, "/backoffice")}
                      style={linkStyle}
                    >
                      <Text fw={600} component="span">
                        {child.name}
                      </Text>
                    </Link>
                  ) : (
                    <Text fw={600}>{slot.child_part_id}</Text>
                  )}
                  <Text size="xs" c="dimmed" ff="monospace">
                    {slot.slot}
                  </Text>
                  {slot.is_optional && (
                    <Badge size="xs" variant="outline" color="gray">
                      Optional
                    </Badge>
                  )}
                </Group>
                <Group gap="sm" wrap="nowrap">
                  <Text size="sm" fw={500} c={full ? "green.7" : "dimmed"}>
                    {rows.length} / {slot.required_quantity}
                  </Text>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    disabled={full}
                    onClick={() => setPicking(slot)}
                  >
                    Install
                  </Button>
                </Group>
              </Group>
              {rows.map((row) => {
                const item = row.component_item;
                return (
                  <Group
                    key={row.id}
                    justify="space-between"
                    pl="md"
                    py={4}
                    style={{
                      borderLeft: "2px solid var(--mantine-color-gray-3)",
                    }}
                  >
                    <Group gap="sm">
                      <Link
                        href={itemHref(
                          item?.part?.sku ?? child?.sku ?? "",
                          row.component_item_id,
                          "/backoffice",
                        )}
                        style={linkStyle}
                      >
                        <Text size="sm" ff="monospace" component="span">
                          {item?.serial_number ?? "Unserialized"}
                        </Text>
                      </Link>
                      {item && (
                        <Text size="xs" c="dimmed">
                          {assemblyLabel(item.assembly_state)}
                        </Text>
                      )}
                    </Group>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      loading={pending}
                      onClick={() => remove(row.id)}
                    >
                      Remove
                    </Button>
                  </Group>
                );
              })}
            </Stack>
          );
        })}
      </Stack>
      {picking && (
        <InstallPicker
          parentItemId={parentItemId}
          slot={picking}
          remaining={picking.required_quantity - installedIn(picking.id).length}
          onClose={() => setPicking(null)}
        />
      )}
    </Section>
  );
}

interface InstallPickerProps {
  parentItemId: string;
  slot: PartComponent;
  remaining: number;
  onClose: () => void;
}

// Lists items of the slot's SKU that are not installed anywhere
function InstallPicker({
  parentItemId,
  slot,
  remaining,
  onClose,
}: InstallPickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
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

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  const install = () =>
    startTransition(async () => {
      const result = await installItems(parentItemId, slot.id, selected);
      router.refresh();
      if (!result.error) {
        onClose();
        return;
      }
      // Some items were taken elsewhere meanwhile: show why and reload the list
      setError(result.error);
      setSelected([]);
      setReload((value) => value + 1);
    });

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Install ${slot.child_part?.name ?? "component"}`}
      size="lg"
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Choose up to {remaining} available{" "}
          {remaining === 1 ? "item" : "items"} for slot{" "}
          <Text span ff="monospace">
            {slot.slot}
          </Text>
          .
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
            <Stack gap={6}>
              {items.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <Checkbox
                    key={item.id}
                    checked={checked}
                    disabled={!checked && selected.length >= remaining}
                    onChange={() => toggle(item.id)}
                    label={
                      <Group gap="xs">
                        <Text size="sm" ff="monospace">
                          {item.serial_number ?? "Unserialized"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {assemblyLabel(item.assembly_state)}
                          {item.location ? ` · ${item.location}` : ""}
                        </Text>
                      </Group>
                    }
                  />
                );
              })}
            </Stack>
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
          <Button
            disabled={selected.length === 0}
            loading={pending}
            onClick={install}
          >
            Install{selected.length > 0 ? ` (${selected.length})` : ""}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
