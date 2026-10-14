import {
  AppShell,
  Badge,
  Burger,
  Button,
  Card,
  Group,
  NavLink,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  Boxes,
  CircleHelp,
  Layers3,
  LayoutDashboard,
  Package,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import {
  Link,
  NavLink as RouterNavLink,
  Route,
  Routes,
} from "react-router-dom";
import { useDisclosure } from "@mantine/hooks";
import { PageTitle, ResourceState, useResource } from "./ui";
import { Catalog, PartPage } from "./parts";
import { Inventory, ItemPage } from "./inventory";
import { type List, type Item, itemLabel } from "./api";
export default function App() {
  const [opened, { toggle, close }] = useDisclosure();
  return (
    <AppShell
      header={{ height: 70 }}
      navbar={{ width: 236, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="xl"
    >
      <AppShell.Header>
        <Group h="100%" px="xl" justify="space-between">
          <Group>
            <Burger
              aria-label="Toggle navigation"
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Link className="brand" to="/">
              <span className="brand-mark">
                <Boxes size={24} />
              </span>
              papi<span className="brand-number">2</span>
            </Link>
            <Badge variant="light" color="gray" visibleFrom="sm">
              Inventory workspace
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" visibleFrom="sm">
            Every part. Every connection.
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <Text className="nav-label" mt="md" mb="sm">
          WORKSPACE
        </Text>
        {[
          { to: "/", label: "Overview", icon: LayoutDashboard },
          { to: "/parts", label: "Part schemas", icon: Layers3 },
          { to: "/inventory", label: "Inventory", icon: Package },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            component={RouterNavLink}
            to={to}
            end={to === "/"}
            label={label}
            leftSection={<Icon size={19} />}
            onClick={close}
            className="nav-item"
          />
        ))}
        <Stack gap={8} className="nav-note">
          <CircleHelp size={20} />
          <Text size="sm" fw={600}>
            Built for real assemblies
          </Text>
          <Text size="xs" c="dimmed">
            Define reusable schemas, track individual items, and follow every
            connection.
          </Text>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <div className="page">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/parts" element={<Catalog />} />
            <Route path="/parts/:id" element={<PartPage />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/:id" element={<ItemPage />} />
            <Route
              path="*"
              element={
                <Stack>
                  <Text>Page not found.</Text>
                  <Button component={Link} to="/">
                    Go to overview
                  </Button>
                </Stack>
              }
            />
          </Routes>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
function Overview() {
  const summary = useResource<{
    parts: number;
    items: number;
    installed_items: number;
    root_items: number;
  }>("/summary");
  const recent = useResource<List<Item>>("/inventory?limit=5");
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        title="Everything, connected."
        description="A clear view of your part catalog and the physical items built from it."
        actions={
          <Button
            component={Link}
            to="/inventory"
            leftSection={<Plus size={16} />}
          >
            Manage inventory
          </Button>
        }
      />
      <ResourceState {...summary} retry={summary.reload} />
      {summary.data && (
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="lg" mb={28}>
          {[
            { label: "Part schemas", value: summary.data.parts, icon: Layers3 },
            {
              label: "Inventory items",
              value: summary.data.items,
              icon: Package,
            },
            {
              label: "Installed items",
              value: summary.data.installed_items,
              icon: Boxes,
            },
            {
              label: "Root assemblies",
              value: summary.data.root_items,
              icon: LayoutDashboard,
            },
          ].map(({ label, value, icon: Icon }) => (
            <Card withBorder p="xl" key={label}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {label}
                </Text>
                <Icon size={20} color="#25856b" />
              </Group>
              <Text size="34px" fw={650} mt="md">
                {value}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder p="xl">
          <Text className="eyebrow">CATALOG</Text>
          <Text size="xl" fw={600} mt="sm">
            Start with a schema
          </Text>
          <Text c="dimmed" mt="xs" mb="lg">
            Define SKUs and their bill of materials. Reuse the same schema
            across any number of physical items.
          </Text>
          <Button
            component={Link}
            to="/parts"
            variant="light"
            rightSection={<ArrowUpRight size={16} />}
          >
            Explore part schemas
          </Button>
        </Card>
        <Card withBorder p="xl">
          <Group justify="space-between" mb="lg">
            <Text fw={600}>Recently added items</Text>
            <Button component={Link} to="/inventory" variant="subtle" size="xs">
              View all
            </Button>
          </Group>
          <ResourceState {...recent} retry={recent.reload} />
          {recent.data?.data.length === 0 && (
            <Text c="dimmed">
              Your inventory is empty. Add your first item to get started.
            </Text>
          )}
          <Stack gap="sm">
            {recent.data?.data.map((item) => (
              <Group key={item.id} justify="space-between">
                <div>
                  <Link className="record-link" to={"/inventory/" + item.id}>
                    {itemLabel(item)}
                  </Link>
                  <Text size="xs" c="dimmed">
                    {item.part?.sku || "Part schema"} ·{" "}
                    {item.location || "No location"}
                  </Text>
                </div>
                <Badge
                  color={item.assembly_state === "complete" ? "teal" : "gray"}
                  variant="light"
                >
                  {item.assembly_state}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>
    </>
  );
}
