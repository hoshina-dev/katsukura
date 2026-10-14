import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Pagination,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle, RefreshCw } from "lucide-react";
import { api } from "./api";
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const lastPath = useRef(path);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    if (lastPath.current !== path) setData(undefined);
    lastPath.current = path;
    api<T>(path)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((reason) => {
        if (current) setError(reason.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, version]);
  return {
    data,
    error,
    loading: loading && !data,
    reload: () => setVersion((value) => value + 1),
  };
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <Alert
      color="red"
      icon={<AlertCircle size={18} />}
      title="Unable to complete request"
    >
      {message}
    </Alert>
  ) : null;
}
export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <Center py={60}>
      <Loader size="sm" />
    </Center>
  ) : error ? (
    <Stack>
      <ErrorMessage message={error} />
      <Button
        variant="light"
        leftSection={<RefreshCw size={16} />}
        onClick={retry}
      >
        Try again
      </Button>
    </Stack>
  ) : null;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" mb={28}>
      <Stack gap={4}>
        <Text className="eyebrow">{eyebrow}</Text>
        <Title order={1}>{title}</Title>
        <Text c="dimmed" maw={650}>
          {description}
        </Text>
      </Stack>
      {actions}
    </Group>
  );
}
export function Pager({
  total,
  page,
  setPage,
  size = 20,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
  size?: number;
}) {
  return (
    <Group justify="space-between" mt={20}>
      <Text size="sm" c="dimmed">
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : "0 results"}
      </Text>
      <Pagination
        value={page}
        onChange={setPage}
        total={Math.max(1, Math.ceil(total / size))}
        size="sm"
      />
    </Group>
  );
}
