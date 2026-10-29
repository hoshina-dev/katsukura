"use client";

import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  NumberInput,
  Select,
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
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  addBomChild,
  deleteBomChild,
  findParts,
  removeBom,
  type SubmitResult,
  updateBomChild,
} from "@/app/actions";
import {
  isPositiveInt,
  type PartComponent,
  skuHref,
  slotName,
} from "@/libs/inventory";

import { TextLink } from "./TextLink";
import { ConfirmModal } from "./ConfirmModal";
import { errorLines } from "./Metadata";
import { EmptyNote, Section } from "./Section";

interface BomSectionProps {
  partId: string;
  // Direct BOM rows, with child_part loaded
  components: PartComponent[];
}

export function BomSection({ partId, components }: BomSectionProps) {
  const router = useRouter();
  const hasComponents = components.length > 0;
  const [open, setOpen] = useState(hasComponents);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open && !hasComponents) {
    return (
      <Group>
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => setOpen(true)}
        >
          Add bill of materials
        </Button>
      </Group>
    );
  }

  const remove = () =>
    startTransition(async () => {
      const result = await removeBom(
        partId,
        components.map((component) => component.id),
      );
      setConfirming(false);
      setError(result.error ?? null);
      if (!result.error) setOpen(false);
      router.refresh();
    });

  return (
    <Section
      title="Bill of materials"
      description="Every item of this part must contain exactly these components"
      actions={
        <Button
          size="xs"
          color="red"
          variant="subtle"
          onClick={() => (hasComponents ? setConfirming(true) : setOpen(false))}
        >
          {hasComponents ? "Remove BOM" : "Cancel"}
        </Button>
      }
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <BomEditor partId={partId} components={components} />
      </Stack>
      <ConfirmModal
        opened={confirming}
        title="Remove bill of materials?"
        message="Every component row of this part is deleted. This cannot be undone."
        confirmLabel="Remove BOM"
        loading={pending}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
}

// Direct children of the BOM: change quantity, delete, or add one.
// The API rejects cycles, duplicate slots and changes that history depends on.
function BomEditor({
  partId,
  components,
}: {
  partId: string;
  components: PartComponent[];
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<PartComponent | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<SubmitResult>, onDone?: () => void) =>
    startTransition(async () => {
      const lines = errorLines(await action());
      setErrors(lines);
      if (lines.length === 0) onDone?.();
      router.refresh();
    });

  return (
    <Stack gap="md">
      {components.length === 0 ? (
        <EmptyNote>No components yet. Pick a part below to add the first slot.</EmptyNote>
      ) : (
        <Box style={{ overflowX: "auto" }} mx="-md">
          <Table verticalSpacing={8} horizontalSpacing="md" miw={560}>
            <TableThead>
              <TableTr>
                <TableTh>Component</TableTh>
                <TableTh>Slot</TableTh>
                <TableTh w={110}>Qty</TableTh>
                <TableTh w={120} />
              </TableTr>
            </TableThead>
            <TableTbody>
              {components.map((component) => (
                <BomRow
                  key={`${component.id}-${component.required_quantity}`}
                  component={component}
                  pending={pending}
                  onSave={(patch) =>
                    run(() => updateBomChild(partId, component.id, patch))
                  }
                  onDelete={() => setDeleting(component)}
                />
              ))}
            </TableTbody>
          </Table>
        </Box>
      )}
      {errors.map((line) => (
        <Text key={line} size="xs" c="red.8">
          {line}
        </Text>
      ))}
      <AddChild
        pending={pending}
        onAdd={(component, reset) =>
          run(() => addBomChild(partId, component), reset)
        }
      />
      <ConfirmModal
        opened={deleting !== null}
        title="Remove component?"
        message={`The ${deleting?.slot ?? ""} slot (${deleting?.child_part?.name ?? "unknown part"}) is removed from the bill of materials. This cannot be undone.`}
        confirmLabel="Remove"
        loading={pending}
        onConfirm={() => {
          if (!deleting) return;
          run(
            () => deleteBomChild(partId, deleting.id),
            () => setDeleting(null),
          );
        }}
        onClose={() => setDeleting(null)}
      />
    </Stack>
  );
}

function BomRow({
  component,
  pending,
  onSave,
  onDelete,
}: {
  component: PartComponent;
  pending: boolean;
  onSave: (patch: { required_quantity: number }) => void;
  onDelete: () => void;
}) {
  const [quantity, setQuantity] = useState<string | number>(
    component.required_quantity,
  );
  const changed = Number(quantity) !== component.required_quantity;
  const child = component.child_part;

  return (
    <TableTr>
      <TableTd>
        {child ? (
          <TextLink href={skuHref(child.sku)}>
            {child.name}
          </TextLink>
        ) : (
          component.child_part_id.slice(0, 8)
        )}
      </TableTd>
      <TableTd>
        <Text size="sm" c="dimmed" ff="monospace">
          {component.slot}
        </Text>
      </TableTd>
      <TableTd>
        <NumberInput
          aria-label={`Quantity of ${component.slot}`}
          value={quantity}
          onChange={setQuantity}
          min={1}
          allowDecimal={false}
          allowNegative={false}
          size="xs"
        />
      </TableTd>
      <TableTd>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          {changed && (
            <Button
              size="xs"
              disabled={!isPositiveInt(quantity)}
              loading={pending}
              onClick={() => onSave({ required_quantity: Number(quantity) })}
            >
              Save
            </Button>
          )}
          <ActionIcon
            className="row-delete"
            variant="subtle"
            color="gray"
            aria-label={`Delete ${component.slot}`}
            onClick={onDelete}
          >
            <IconTrash size={16} stroke={1.5} />
          </ActionIcon>
        </Group>
      </TableTd>
    </TableTr>
  );
}

type PartOption = { id: string; sku: string; name: string };

function AddChild({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (
    component: {
      child_part_id: string;
      slot: string;
      required_quantity: number;
    },
    reset: () => void,
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [options, setOptions] = useState<PartOption[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [slot, setSlot] = useState("");
  const [quantity, setQuantity] = useState<string | number>(1);

  useEffect(() => {
    let current = true;
    findParts(debounced).then((parts) => {
      if (current) setOptions(parts);
    });
    return () => {
      current = false;
    };
  }, [debounced]);

  const reset = () => {
    setChildId(null);
    setSearch("");
    setSlot("");
    setQuantity(1);
  };

  return (
    <Group
      align="flex-end"
      gap="sm"
      pt="md"
      style={{ borderTop: "1px solid var(--app-line)" }}
    >
      <Select
        label="Add component"
        placeholder="Search parts by name or SKU"
        searchable
        clearable
        value={childId}
        searchValue={search}
        onSearchChange={setSearch}
        // Results come from the API search, so skip client filtering
        filter={({ options }) => options}
        data={options.map((part) => ({
          value: part.id,
          label: `${part.name} · ${part.sku}`,
        }))}
        onChange={(value) => {
          setChildId(value);
          const part = options.find((option) => option.id === value);
          if (part) setSlot(slotName(part.name));
        }}
        nothingFoundMessage="No parts found"
        style={{ flex: "2 1 240px" }}
      />
      <TextInput
        label="Slot"
        value={slot}
        onChange={(event) => setSlot(event.currentTarget.value)}
        style={{ flex: "1 1 140px" }}
      />
      <NumberInput
        label="Qty"
        value={quantity}
        onChange={setQuantity}
        min={1}
        allowDecimal={false}
        allowNegative={false}
        w={80}
      />
      <Button
        variant="default"
        leftSection={<IconPlus size={16} />}
        disabled={!childId || !slot.trim() || !isPositiveInt(quantity)}
        loading={pending}
        onClick={() =>
          childId &&
          onAdd(
            {
              child_part_id: childId,
              slot: slot.trim(),
              required_quantity: Number(quantity),
            },
            reset,
          )
        }
      >
        Add component
      </Button>
    </Group>
  );
}
