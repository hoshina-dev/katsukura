"use client";

import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";

import { generateSerialNumber, type PartComponent } from "@/libs/inventory";

interface AddItemsModalProps {
  count: number;
  // BOM rows, with child_part and its stock loaded
  slots: PartComponent[];
  serialAware?: boolean;
  loading?: boolean;
  // Why the last attempt failed
  error?: string | null;
  onSubmit: (serialNumbers: string[]) => void;
  onClose: () => void;
}

// Mount only while open, so each opening suggests fresh serial numbers
export function AddItemsModal({
  count,
  slots,
  serialAware = true,
  loading,
  error,
  onSubmit,
  onClose,
}: AddItemsModalProps) {
  const [rows, setRows] = useState(() =>
    Array.from({ length: count }, () => ({
      suggested: generateSerialNumber(),
      value: "",
    })),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const label = count === 1 ? "item" : "items";

  const submit = () => {
    if (!serialAware) {
      onSubmit([]);
      return;
    }
    // A blank field takes the serial shown as its placeholder
    const serials = rows.map((row) => row.value.trim() || row.suggested);
    const repeated = serials.find((s, i) => serials.indexOf(s) !== i);
    if (repeated) {
      setProblem(`Serial number ${repeated} is listed twice`);
      return;
    }
    setProblem(null);
    onSubmit(serials);
  };

  return (
    <Modal opened onClose={onClose} title={`Add ${count} ${label}`} centered>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap="sm">
          {slots.length > 0 && <StockNeeded slots={slots} count={count} />}
          {serialAware ? (
            <>
              <Text size="sm" c="dimmed">
                Leave a field blank to use the generated serial number. Serial
                numbers cannot be changed after the {label} are added.
              </Text>
              {rows.map((row, index) => (
                <TextInput
                  key={row.suggested}
                  aria-label={`Serial number for item ${index + 1}`}
                  leftSection={
                    <Text size="xs" c="dimmed" className="tabular">
                      {index + 1}
                    </Text>
                  }
                  placeholder={row.suggested}
                  value={row.value}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setRows((current) =>
                      current.map((other, i) =>
                        i === index ? { ...other, value } : other,
                      ),
                    );
                  }}
                  styles={{
                    input: {
                      fontFamily: "var(--mantine-font-family-monospace)",
                    },
                  }}
                  data-autofocus={index === 0 || undefined}
                />
              ))}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Stock for this unit will increase by {count}.
            </Text>
          )}
          {(problem ?? error) && (
            <Alert color="red" variant="light">
              {problem ?? error}
            </Alert>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Add {label}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// Each new item takes the oldest free items of every BOM slot; the API adds
// nothing if any slot is short
function StockNeeded({
  slots,
  count,
}: {
  slots: PartComponent[];
  count: number;
}) {
  return (
    <Stack gap={4}>
      <Text size="sm">Taken from stock:</Text>
      {slots.map((slot) => {
        const need = slot.required_quantity * count;
        const free = slot.child_part?.stock?.available ?? 0;
        return (
          <Group key={slot.id} justify="space-between" wrap="nowrap">
            <Text size="sm" truncate>
              {slot.child_part?.name ?? slot.slot}{" "}
              <Text span size="xs" c="dimmed" ff="monospace">
                {slot.slot}
              </Text>
            </Text>
            <Text
              size="sm"
              className="tabular"
              c={need > free ? "red.8" : "dimmed"}
              style={{ flexShrink: 0 }}
            >
              {need} of {free} free
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}
