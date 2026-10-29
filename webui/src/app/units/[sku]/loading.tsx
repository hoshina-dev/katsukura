import { Grid, GridCol, Skeleton, Stack } from "@mantine/core";

export default function Loading() {
  return (
    <Stack gap="lg">
      <Stack gap={8}>
        <Skeleton height={12} width={60} />
        <Skeleton height={26} width={280} />
        <Skeleton height={14} width={360} />
      </Stack>
      <Grid gutter="md">
        <GridCol span={{ base: 12, lg: 8 }}>
          <Skeleton height={320} />
        </GridCol>
        <GridCol span={{ base: 12, lg: 4 }}>
          <Skeleton height={320} />
        </GridCol>
      </Grid>
    </Stack>
  );
}
