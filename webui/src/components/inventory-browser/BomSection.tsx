"use client";

import { Alert, Button, Group, Stack } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import { removeBom } from "@/app/backoffice/actions";

import { ConfirmModal } from "./ConfirmModal";
import { EmptyNote, Section } from "./Section";

interface BomSectionProps {
  partId: string;
  componentIds: string[];
  // Backoffice: add or remove the BOM
  editable?: boolean;
  // The rendered BOM tree
  children: ReactNode;
}

export function BomSection({
  partId,
  componentIds,
  editable,
  children,
}: BomSectionProps) {
  const router = useRouter();
  const hasComponents = componentIds.length > 0;
  const [open, setOpen] = useState(hasComponents);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editable && !hasComponents) return null;
  if (editable && !open) {
    return (
      <Group>
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => setOpen(true)}
        >
          Add BOM
        </Button>
      </Group>
    );
  }

  const remove = () =>
    startTransition(async () => {
      const result = await removeBom(partId, componentIds);
      setConfirming(false);
      setError(result.error ?? null);
      if (!result.error) setOpen(false);
      router.refresh();
    });

  return (
    <Section
      title="Components / Bill of Materials"
      description="What this product should contain"
      actions={
        editable && (
          <Button
            color="red"
            variant="light"
            onClick={() =>
              hasComponents ? setConfirming(true) : setOpen(false)
            }
          >
            Remove BOM
          </Button>
        )
      }
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {hasComponents ? (
          <div>{children}</div>
        ) : (
          <EmptyNote>No components yet.</EmptyNote>
        )}
      </Stack>
      {editable && (
        <ConfirmModal
          opened={confirming}
          title="Remove BOM"
          message="If you continue, this product's component relationships will be deleted. This cannot be undone."
          confirmLabel="Remove BOM"
          loading={pending}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </Section>
  );
}
