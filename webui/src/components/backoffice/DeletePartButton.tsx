"use client";

import { ActionIcon, Box } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useRouter } from "@/libs/nav";
import { useState, useTransition } from "react";

import { deletePart, partDeleteBlocker } from "@/app/actions";
import { itemsLabel } from "@/libs/inventory";

import { ConfirmModal } from "./ConfirmModal";

interface DeletePartButtonProps {
  partId: string;
  name: string;
  itemCount: number;
  onDeleted?: () => void;
  // Sits over a card image, so it needs its own background
  onImage?: boolean;
}

function deleteMessage(itemCount: number) {
  return [
    itemCount > 0 &&
      `This also deletes its ${itemsLabel(itemCount)} in inventory.`,
    itemCount > 0 && "Any items installed in them go back to stock.",
    "This can't be undone.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Bin on a catalog card or row. Its wrapper keeps clicks (including ones
// inside the dialog, which bubble through React) from opening the part.
export function DeletePartButton({
  partId,
  name,
  itemCount,
  onDeleted,
  onImage,
}: DeletePartButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the API would refuse the delete; null once checked and clear
  const [blocker, setBlocker] = useState<string | null | undefined>();
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(null);
    setBlocker(undefined);
    setConfirming(true);
    partDeleteBlocker(partId)
      .then(setBlocker)
      // The delete itself still reports any refusal
      .catch(() => setBlocker(null));
  };

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
        className="row-delete"
        variant={onImage ? "white" : "subtle"}
        color="gray"
        aria-label={`Delete ${name}`}
        onClick={open}
      >
        <IconTrash size={16} stroke={1.5} />
      </ActionIcon>
      <ConfirmModal
        opened={confirming}
        title={blocker ? `${name} can't be deleted yet` : `Delete ${name}?`}
        message={
          blocker === undefined
            ? `Checking whether ${name} can be deleted…`
            : (blocker ?? deleteMessage(itemCount))
        }
        confirmLabel="Delete unit"
        loading={pending || blocker === undefined}
        hideConfirm={!!blocker}
        error={error}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </Box>
  );
}
