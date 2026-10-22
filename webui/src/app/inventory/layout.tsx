import { Box, Container } from "@mantine/core";
import type { ReactNode } from "react";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <Box bg="gray.0" mih="100vh">
      <Container size={1200} py="xl" px="md">
        {children}
      </Container>
    </Box>
  );
}
