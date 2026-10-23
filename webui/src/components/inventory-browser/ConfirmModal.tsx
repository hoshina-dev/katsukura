"use client";

import { Button, Group, Modal, Text } from "@mantine/core";

interface ConfirmModalProps {
  opened: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  opened,
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Text size="sm">{message}</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button color="red" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
