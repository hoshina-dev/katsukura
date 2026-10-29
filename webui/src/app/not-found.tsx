import {
  Box,
  Button,
  Container,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconHome, IconMapOff } from "@tabler/icons-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <Container size="sm" py={{ base: 48, md: 72 }}>
      <Box
        p={{ base: "xl", md: "xl" }}
        style={{
          borderRadius: "var(--mantine-radius-xl)",
          border:
            "1px solid light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.1))",
          backgroundColor:
            "light-dark(rgba(255, 255, 255, 0.7), rgba(30, 30, 30, 0.7))",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          boxShadow:
            "0 2px 16px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.3))",
        }}
      >
        <Stack align="center" gap="lg" ta="center">
          <ThemeIcon
            size={64}
            radius="xl"
            variant="gradient"
            gradient={{ from: "blue", to: "teal", deg: 90 }}
          >
            <IconMapOff size={34} stroke={1.5} />
          </ThemeIcon>

          <Text
            component="span"
            display="block"
            size="3.5rem"
            fw={800}
            lh={1}
            variant="gradient"
            gradient={{ from: "blue", to: "teal", deg: 90 }}
          >
            404
          </Text>

          <Title order={2}>Page not found</Title>

          <Text c="dimmed" size="sm" maw={380}>
            This page doesn&apos;t exist or the link may be wrong. Check the URL
            or return to the map.
          </Text>

          <Link href="/" style={{ textDecoration: "none" }}>
            <Button
              size="md"
              variant="light"
              leftSection={<IconHome size={18} />}
            >
              Back to home
            </Button>
          </Link>
        </Stack>
      </Box>
    </Container>
  );
}
