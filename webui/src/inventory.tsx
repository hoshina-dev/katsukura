import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  Archive,
  ArrowLeft,
  GitBranch,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Unplug,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  itemLabel,
  missingQuantity,
  query,
  type Component,
  type Item,
  type ItemDetail,
  type List,
  type PartDetail,
  type TreeNode,
  type Installation,
} from "./api";
import { ConfirmArchive, EntityForm } from "./forms";
import { RecordPicker } from "./picker";
import {
  ErrorMessage,
  Pager,
  PageTitle,
  ResourceState,
  useResource,
} from "./ui";
export function Inventory() {
  const [search, setSearch] = useState("");
  const [term] = useDebouncedValue(search, 200);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const resource = useResource<List<Item>>(
    "/inventory" +
      query({
        search: term,
        include_archived: archived,
        part_id: filter,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  );
  return (
    <>
      <PageTitle
        eyebrow="PHYSICAL ITEMS"
        title="Inventory"
        description="Track individual items, their locations, and how they connect."
        actions={
          <Button
            leftSection={<Plus size={16} />}
            onClick={() => setCreate(true)}
          >
            New item
          </Button>
        }
      />
      <Card withBorder p="lg">
        <Group justify="space-between" mb="lg">
          <TextInput
            aria-label="Search inventory"
            placeholder="Search serial number or SKU"
            leftSection={<Search size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="search-input"
          />
          <Checkbox
            label="Include archived"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />
        </Group>
        <Group align="flex-end" mb="lg">
          <div className="schema-filter">
            <RecordPicker
              kind="parts"
              label="Filter by schema"
              required={false}
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setPage(1);
              }}
            />
          </div>
          {filter && (
            <Button
              variant="subtle"
              onClick={() => {
                setFilter("");
                setPage(1);
              }}
            >
              Clear filter
            </Button>
          )}
        </Group>
        <ResourceState {...resource} retry={resource.reload} />
        {resource.data && (
          <>
            <Table.ScrollContainer minWidth={700}>
              <Table verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Part schema</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Assembly</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resource.data.data.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Link
                          className="record-link"
                          to={"/inventory/" + item.id}
                        >
                          {itemLabel(item)}
                        </Link>
                        <Text size="xs" c="dimmed">
                          {item.serial_number ? "Serial number" : "Item ID"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {item.part?.name || item.part_id.slice(0, 8)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {item.part?.sku}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.location || "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            item.assembly_state === "complete" ? "teal" : "gray"
                          }
                          variant="light"
                        >
                          {item.assembly_state}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={item.archived_at ? "gray" : "teal"}
                          variant="dot"
                        >
                          {item.archived_at ? "Archived" : "Active"}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!resource.data.data.length && (
              <Text ta="center" c="dimmed" py="xl">
                No items found. Add an item or adjust your filters.
              </Text>
            )}
            <Pager total={resource.data.total} page={page} setPage={setPage} />
          </>
        )}
      </Card>
      {create && (
        <EntityForm
          kind="inventory"
          onClose={() => setCreate(false)}
          onSaved={(id) => navigate("/inventory/" + id)}
        />
      )}
    </>
  );
}
export function ItemPage() {
  const { id } = useParams();
  const resource = useResource<ItemDetail>("/inventory/" + id);
  const [editing, setEditing] = useState(false);
  const [archive, setArchive] = useState(false);
  const [install, setInstall] = useState<Component>();
  const [remove, setRemove] = useState<Installation>();
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    setError("");
  }, [id]);
  const item = resource.data;
  return (
    <>
      <Button
        component={Link}
        to="/inventory"
        variant="subtle"
        leftSection={<ArrowLeft size={16} />}
        mb="md"
      >
        Inventory
      </Button>
      <ResourceState {...resource} retry={resource.reload} />
      {item && (
        <>
          <PageTitle
            eyebrow={item.part?.sku || "INVENTORY ITEM"}
            title={itemLabel(item)}
            description={item.part?.name || item.part_id}
            actions={
              <Group>
                <Button
                  variant="default"
                  leftSection={<Pencil size={16} />}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
                {item.archived_at ? (
                  <Button
                    variant="light"
                    leftSection={<RotateCcw size={16} />}
                    loading={restoring}
                    onClick={async () => {
                      setError("");
                      setRestoring(true);
                      try {
                        await api("/inventory/" + id, "PATCH", {
                          archived_at: null,
                        });
                        resource.reload();
                      } catch (reason) {
                        setError((reason as Error).message);
                      } finally {
                        setRestoring(false);
                      }
                    }}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    color="red"
                    leftSection={<Archive size={16} />}
                    onClick={() => setArchive(true)}
                  >
                    Archive
                  </Button>
                )}
              </Group>
            }
          />
          <ErrorMessage message={error} />
          {item.archived_at && (
            <Alert color="gray" mb="lg">
              This item is archived.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
            <Card withBorder>
              <Text size="xs" c="dimmed" mb="sm">
                PART SCHEMA
              </Text>
              <Link className="record-link" to={"/parts/" + item.part_id}>
                {item.part?.sku || item.part_id.slice(0, 8)}
              </Link>
            </Card>
            <Card withBorder>
              <Group mb="sm" gap="xs">
                <MapPin size={14} />
                <Text size="xs" c="dimmed">
                  LOCATION
                </Text>
              </Group>
              <Text>{item.location || "No location assigned"}</Text>
            </Card>
            <Card withBorder>
              <Text size="xs" c="dimmed" mb="sm">
                ASSEMBLY STATE
              </Text>
              <Badge
                color={item.assembly_state === "complete" ? "teal" : "gray"}
                variant="light"
              >
                {item.assembly_state}
              </Badge>
              <Text size="xs" c="dimmed" mt="xs">
                Informational; missing components allowed
              </Text>
            </Card>
          </SimpleGrid>
          {item.parent && (
            <Alert
              mb="lg"
              color="teal"
              icon={<GitBranch size={18} />}
              title="Installed in a parent item"
            >
              <Link
                className="record-link"
                to={"/inventory/" + item.parent.parent_item_id}
              >
                {item.parent.parent_item
                  ? itemLabel(item.parent.parent_item)
                  : item.parent.parent_item_id.slice(0, 8)}
              </Link>
              {item.parent.position && ` · ${item.parent.position}`}
              {item.parent.parent_item?.part && (
                <Text size="sm" mt="xs">
                  Parent schema:{" "}
                  <Link
                    className="record-link"
                    to={"/parts/" + item.parent.parent_item.part.id}
                  >
                    {item.parent.parent_item.part.name} ·{" "}
                    {item.parent.parent_item.part.sku}
                  </Link>
                </Text>
              )}
            </Alert>
          )}
          <Tabs defaultValue="components">
            <Tabs.List mb="lg">
              <Tabs.Tab value="components">Components</Tabs.Tab>
              <Tabs.Tab value="tree">Assembly tree</Tabs.Tab>
              <Tabs.Tab value="history">Installation history</Tabs.Tab>
              <Tabs.Tab value="metadata">Metadata</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="components">
              <Components
                item={item}
                onInstall={setInstall}
                onRemove={setRemove}
              />
            </Tabs.Panel>
            <Tabs.Panel value="tree">
              <AssemblyTree
                id={item.id}
                key={item.updated_at + item.components.map((c) => c.id).join()}
              />
            </Tabs.Panel>
            <Tabs.Panel value="history">
              <History rows={item.history} />
            </Tabs.Panel>
            <Tabs.Panel value="metadata">
              <Card withBorder p="lg">
                <Title order={3}>Metadata</Title>
                <pre className="json-view">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
                <Text size="xs" c="dimmed">
                  Created {new Date(item.created_at).toLocaleString()} · Updated{" "}
                  {new Date(item.updated_at).toLocaleString()}
                </Text>
              </Card>
            </Tabs.Panel>
          </Tabs>
          {editing && (
            <EntityForm
              kind="inventory"
              entity={item}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                resource.reload();
              }}
            />
          )}
          {archive && (
            <ConfirmArchive
              name={itemLabel(item)}
              onClose={() => setArchive(false)}
              onConfirm={async () => {
                await api("/inventory/" + item.id, "DELETE");
                resource.reload();
              }}
            />
          )}
          {install && (
            <InstallForm
              item={item}
              component={install}
              onClose={() => setInstall(undefined)}
              onSaved={() => {
                setInstall(undefined);
                resource.reload();
              }}
            />
          )}
          {remove && (
            <RemoveForm
              item={item}
              installation={remove}
              onClose={() => setRemove(undefined)}
              onSaved={resource.reload}
            />
          )}
        </>
      )}
    </>
  );
}
function Components({
  item,
  onInstall,
  onRemove,
}: {
  item: ItemDetail;
  onInstall: (component: Component) => void;
  onRemove: (installation: Installation) => void;
}) {
  const schema = useResource<PartDetail>("/parts/" + item.part_id);
  return (
    <>
      <ResourceState {...schema} retry={schema.reload} />
      {schema.data && (
        <Stack>
          {!schema.data.components.length && (
            <Card withBorder p="xl">
              <Text c="dimmed">
                This schema has no BOM slots. Define components in the part
                schema to build an assembly.
              </Text>
            </Card>
          )}
          {schema.data.components.map((component) => {
            const rows = item.components.filter(
              (row) => row.part_component_id === component.id,
            );
            const missing = missingQuantity(component, item.components);
            return (
              <Card withBorder p="lg" key={component.id}>
                <Group justify="space-between" mb="md">
                  <div>
                    <Group gap="sm">
                      <Title order={4}>{component.slot}</Title>
                      <Badge
                        color={component.is_optional ? "gray" : "teal"}
                        variant="light"
                      >
                        {component.is_optional ? "Optional" : "Required"}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mt={4}>
                      {component.child_part?.sku} ·{" "}
                      {component.child_part?.name ||
                        component.child_part_id.slice(0, 8)}
                    </Text>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    disabled={missing === 0 || !!item.archived_at}
                    leftSection={<Plus size={16} />}
                    onClick={() => onInstall(component)}
                  >
                    Install item
                  </Button>
                </Group>
                <Group justify="space-between" mb="xs">
                  <Text size="sm">
                    {rows.length} / {component.required_quantity} installed
                  </Text>
                  <Text size="xs" c={missing ? "orange" : "teal"}>
                    {missing
                      ? `${missing} missing${component.is_optional ? " (optional)" : ""}`
                      : "Slot filled"}
                  </Text>
                </Group>
                <Progress
                  value={(rows.length / component.required_quantity) * 100}
                  size={5}
                  mb="md"
                />
                {rows.map((row) => (
                  <Group
                    key={row.id}
                    justify="space-between"
                    className="installation-row"
                  >
                    <div>
                      <Link
                        className="record-link"
                        to={"/inventory/" + row.component_item_id}
                      >
                        {row.component_item
                          ? itemLabel(row.component_item)
                          : row.component_item_id.slice(0, 8)}
                      </Link>
                      <Text size="xs" c="dimmed">
                        {row.position || "No position"} · Installed{" "}
                        {new Date(row.installed_at).toLocaleDateString()}
                      </Text>
                    </div>
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      color="red"
                      leftSection={<Unplug size={14} />}
                      aria-label={`Remove ${row.component_item ? itemLabel(row.component_item) : row.component_item_id.slice(0, 8)}`}
                      onClick={() => onRemove(row)}
                    >
                      Remove
                    </Button>
                  </Group>
                ))}
              </Card>
            );
          })}
        </Stack>
      )}
    </>
  );
}
function InstallForm({
  item,
  component,
  onClose,
  onSaved,
}: {
  item: ItemDetail;
  component: Component;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [child, setChild] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal opened onClose={onClose} title={"Install into " + component.slot}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!child) throw new Error("Choose an inventory item.");
            const candidate = await api<ItemDetail>("/inventory/" + child);
            if (candidate.parent)
              throw new Error(
                "This item is already installed in another parent. Remove it there first.",
              );
            await api("/inventory/" + item.id + "/components", "POST", {
              component_item_id: child,
              part_component_id: component.id,
              position: position.trim() || null,
            });
            onSaved();
          } catch (reason) {
            setError((reason as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Choose an active {component.child_part?.sku || "matching SKU"} item.{" "}
            {missingQuantity(component, item.components)} space(s) remaining.
          </Text>
          <ErrorMessage message={error} />
          <RecordPicker
            kind="inventory"
            partID={component.child_part_id}
            exclude={item.id}
            label="Component item"
            value={child}
            onChange={setChild}
          />
          <TextInput
            label="Position"
            description="Optional label for this installation"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Install item
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
function RemoveForm({
  item,
  installation,
  onClose,
  onSaved,
}: {
  item: Item;
  installation: Installation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal opened onClose={onClose} title="Remove installed component">
      <Stack>
        <Text>
          Detach{" "}
          {installation.component_item
            ? itemLabel(installation.component_item)
            : installation.component_item_id.slice(0, 8)}
          ? Its installation history will be retained.
        </Text>
        <ErrorMessage message={error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  `/inventory/${item.id}/components/${installation.id}`,
                  "DELETE",
                );
                onSaved();
                onClose();
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove component
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
function History({ rows }: { rows: Installation[] }) {
  return (
    <Card withBorder p="lg">
      <Title order={3} mb="md">
        Installation history
      </Title>
      <Table.ScrollContainer minWidth={650}>
        <Table verticalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Component</Table.Th>
              <Table.Th>Slot / position</Table.Th>
              <Table.Th>Installed</Table.Th>
              <Table.Th>Removed</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  <Link
                    className="record-link"
                    to={"/inventory/" + row.component_item_id}
                  >
                    {row.component_item
                      ? itemLabel(row.component_item)
                      : row.component_item_id.slice(0, 8)}
                  </Link>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{String(row.bom_snapshot.slot || "—")}</Text>
                  <Text size="xs" c="dimmed">
                    {row.position || "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {new Date(row.installed_at).toLocaleString()}
                </Table.Td>
                <Table.Td>
                  {row.removed_at ? (
                    new Date(row.removed_at).toLocaleString()
                  ) : (
                    <Badge variant="light">Active</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!rows.length && (
        <Text c="dimmed" ta="center" py="xl">
          No installation history yet.
        </Text>
      )}
    </Card>
  );
}
function AssemblyTree({ id }: { id: string }) {
  const resource = useResource<TreeNode>("/inventory/" + id + "/tree?depth=20");
  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="md">
        <Title order={3}>Assembly tree</Title>
        <Button variant="subtle" size="xs" onClick={resource.reload}>
          Refresh tree
        </Button>
      </Group>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && <TreeBranch node={resource.data} />}
    </Card>
  );
}
function TreeBranch({ node }: { node: TreeNode }) {
  return (
    <div className="tree-branch">
      <Group gap="sm">
        <GitBranch size={16} color="#25856b" />
        <Link className="record-link" to={"/inventory/" + node.item.id}>
          {itemLabel(node.item)}
        </Link>
        <Text size="xs" c="dimmed">
          {node.item.part?.sku}
        </Text>
      </Group>
      {node.truncated && (
        <Text size="xs" c="orange">
          Response limit reached. Open this item to continue exploring its
          descendants.
        </Text>
      )}
      {node.children?.map((child) => (
        <TreeBranch key={child.item.id} node={child} />
      ))}
    </div>
  );
}
