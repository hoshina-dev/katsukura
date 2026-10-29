import { SimpleGrid, Skeleton, Stack } from "@mantine/core";

export default function Loading() {
  return (
    <Stack gap="lg">
      <Skeleton height={14} width={140} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
        <Skeleton style={{ aspectRatio: "4 / 3" }} radius="md" />
        <Stack gap="sm">
          <Skeleton height={28} width="70%" />
          <Skeleton height={14} width="30%" />
          <Skeleton height={14} mt="md" />
          <Skeleton height={14} width="80%" />
        </Stack>
      </SimpleGrid>
      <Skeleton height={200} radius="md" />
    </Stack>
  );
}
