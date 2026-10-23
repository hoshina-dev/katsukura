"use client";

import { ActionIcon, Box } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deletePart } from "@/app/backoffice/actions";
import { unitsLabel } from "@/libs/inventory";

import { ConfirmModal } from "./ConfirmModal";

interface DeletePartButtonProps {
  partId: string;
  name: string;
  itemCount: number;
  // A composite's items release their components back to stock
  isProduct: boolean;
  onDeleted?: () => void;
}

// Red bin on a catalog card or row. Its wrapper keeps clicks (including ones
// inside the dialog, which bubble through React) from opening the part.
export function DeletePartButton({
  partId,
  name,
  itemCount,
  isProduct,
  onDeleted,
}: DeletePartButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deletePart(partId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      onDeleted?.();
      router.refresh();
    });

  return (
    <Box
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ActionIcon
        color="red"
        variant="white"
        style={{ boxShadow: "var(--mantine-shadow-xs)" }}
        aria-label={`Delete ${name}`}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <IconTrash size={16} />
      </ActionIcon>
      <ConfirmModal
        opened={confirming}
        title={`Delete ${name}?`}
        message={[
          itemCount > 0 &&
            `This also deletes its ${unitsLabel(itemCount)} in inventory.`,
          itemCount > 0 && isProduct && "Their parts go back to stock.",
          "This can't be undone.",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel="Delete"
        loading={pending}
        error={error}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </Box>
  );
}
