import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea, type MantineColor } from '@mantine/core';

interface ReasonModalProps {
  opened: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmColor?: MantineColor;
  /** When true the reason must be filled in. */
  required?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** Small confirmation dialog that collects an (optional) reason. */
export function ReasonModal({
  opened,
  title,
  description,
  confirmLabel,
  confirmColor = 'red',
  required,
  loading,
  onClose,
  onConfirm,
}: ReasonModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (opened) setReason('');
  }, [opened]);

  const trimmed = reason.trim();

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        <Textarea
          label={required ? 'Reason' : 'Reason (optional)'}
          placeholder="Shown to the user"
          autosize
          minRows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          withAsterisk={required}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color={confirmColor}
            loading={loading}
            disabled={required && !trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
