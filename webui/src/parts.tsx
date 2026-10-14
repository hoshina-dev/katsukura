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
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  Archive,
  ArrowLeft,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  query,
  type Part,
  type PartDetail,
  type Component,
  type List,
} from "./api";
import { ConfirmArchive, EntityForm } from "./forms";
import { RecordPicker } from "./picker";
import {
  ErrorMessage,
  PageTitle,
  Pager,
  ResourceState,
  useResource,
} from "./ui";
export function Catalog() {
  const [search, setSearch] = useState("");
  const [term] = useDebouncedValue(search, 200);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const resource = useResource<List<Part>>(
    "/parts" +
      query({
        search: term,
        include_archived: archived,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  );
  return (
    <>
      <PageTitle
        eyebrow="CATALOG"
        title="Part schemas"
        description="Reusable SKUs and bills of materials for every item in your inventory."
        actions={
          <Button
            leftSection={<Plus size={16} />}
            onClick={() => setCreate(true)}
          >
            New schema
          </Button>
        }
      />
      <Card withBorder p="lg">
        <Group justify="space-between" mb="lg">
          <TextInput
            aria-label="Search part schemas"
            placeholder="Search SKU or name"
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
        <ResourceState {...resource} retry={resource.reload} />
        {resource.data && (
          <>
            <Table.ScrollContainer minWidth={550}>
              <Table verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Schema</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resource.data.data.map((part) => (
                    <Table.Tr key={part.id}>
                      <Table.Td>
                        <Link className="record-link" to={"/parts/" + part.id}>
                          {part.name}
                        </Link>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" className="mono">
                          {part.sku}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {part.description || "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={part.archived_at ? "gray" : "teal"}
                        >
                          {part.archived_at ? "Archived" : "Active"}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!resource.data.data.length && (
              <Text ta="center" c="dimmed" py="xl">
                No schemas found. Create a schema or adjust your search.
              </Text>
            )}
            <Pager total={resource.data.total} page={page} setPage={setPage} />
          </>
        )}
      </Card>
      {create && (
        <EntityForm
          kind="parts"
          onClose={() => setCreate(false)}
          onSaved={(id) => navigate("/parts/" + id)}
        />
      )}
    </>
  );
}
export function PartPage() {
  const { id } = useParams();
  const resource = useResource<PartDetail>("/parts/" + id);
  const [editing, setEditing] = useState(false);
  const [archive, setArchive] = useState(false);
  const [bom, setBom] = useState<Component | null | undefined>();
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Component>();
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    setError("");
  }, [id]);
  const part = resource.data;
  async function restore() {
    setError("");
    setRestoring(true);
    try {
      await api("/parts/" + id, "PATCH", { archived_at: null });
      resource.reload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setRestoring(false);
    }
  }
  return (
    <>
      <Button
        component={Link}
        to="/parts"
        variant="subtle"
        leftSection={<ArrowLeft size={16} />}
        mb="md"
      >
        Part schemas
      </Button>
      <ResourceState {...resource} retry={resource.reload} />
      {part && (
        <>
          <PageTitle
            eyebrow={part.sku}
            title={part.name}
            description={part.description || "No description provided."}
            actions={
              <Group>
                <Button
                  variant="default"
                  leftSection={<Pencil size={16} />}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
                {part.archived_at ? (
                  <Button
                    variant="light"
                    leftSection={<RotateCcw size={16} />}
                    loading={restoring}
                    onClick={restore}
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
          {part.archived_at && (
            <Alert color="gray" mb="lg">
              This schema is archived.
            </Alert>
          )}
          <ParentUsages parents={part.parents} />
          <Card withBorder p="lg" mb="lg">
            <Group justify="space-between" mb="md">
              <div>
                <Title order={3}>Bill of materials</Title>
                <Text size="sm" c="dimmed">
                  Required quantities are installation caps. Missing components
                  are always allowed.
                </Text>
              </div>
              <Button
                size="sm"
                leftSection={<Plus size={16} />}
                disabled={!!part.archived_at}
                onClick={() => setBom(null)}
              >
                Add component
              </Button>
            </Group>
            <Table.ScrollContainer minWidth={650}>
              <Table verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Slot</Table.Th>
                    <Table.Th>Child schema</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Requirement</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {part.components.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.slot}</Table.Td>
                      <Table.Td>
                        <Link
                          className="record-link"
                          to={"/parts/" + c.child_part_id}
                        >
                          {c.child_part?.name || c.child_part_id.slice(0, 8)}
                        </Link>
                        <Text size="xs" c="dimmed">
                          {c.child_part?.sku}
                        </Text>
                      </Table.Td>
                      <Table.Td>{c.required_quantity}</Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={c.is_optional ? "gray" : "teal"}
                        >
                          {c.is_optional ? "Optional" : "Required"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<Pencil size={14} />}
                            onClick={() => setBom(c)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="subtle"
                            color="red"
                            size="compact-sm"
                            aria-label={"Remove slot " + c.slot}
                            onClick={() => setRemoving(c)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!part.components.length && (
              <Text ta="center" c="dimmed" py="xl">
                This schema has no components yet.
              </Text>
            )}
          </Card>
          <Card withBorder p="lg">
            <Title order={3} mb="md">
              Metadata
            </Title>
            <pre className="json-view">
              {JSON.stringify(part.metadata, null, 2)}
            </pre>
          </Card>
          {editing && (
            <EntityForm
              kind="parts"
              entity={part}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                resource.reload();
              }}
            />
          )}
          {archive && (
            <ConfirmArchive
              name={part.name}
              onClose={() => setArchive(false)}
              onConfirm={async () => {
                await api("/parts/" + id, "DELETE");
                resource.reload();
              }}
            />
          )}
          {bom !== undefined && (
            <ComponentForm
              part={part}
              component={bom}
              onClose={() => setBom(undefined)}
              onSaved={() => {
                setBom(undefined);
                resource.reload();
              }}
            />
          )}
          {removing && (
            <DeleteComponent
              component={removing}
              parentID={part.id}
              onClose={() => setRemoving(undefined)}
              onSaved={resource.reload}
            />
          )}
        </>
      )}
    </>
  );
}
function DeleteComponent({
  component,
  parentID,
  onClose,
  onSaved,
}: {
  component: Component;
  parentID: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal opened onClose={onClose} title="Remove BOM slot">
      <Stack>
        <Text>
          Remove slot “{component.slot}”? Slots referenced by installation
          history cannot be removed.
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
                  `/parts/${parentID}/components/${component.id}`,
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
            Remove slot
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
function ComponentForm({
  part,
  component,
  onClose,
  onSaved,
}: {
  part: Part;
  component: Component | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [child, setChild] = useState(component?.child_part_id || "");
  const [slot, setSlot] = useState(component?.slot || "");
  const [quantity, setQuantity] = useState<string | number>(
    component?.required_quantity || 1,
  );
  const [optional, setOptional] = useState(component?.is_optional || false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      opened
      onClose={onClose}
      title={component ? "Edit BOM slot" : "Add BOM slot"}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!child) throw new Error("Select a child schema.");
            if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1)
              throw new Error("Quantity must be a positive integer.");
            await api(
              `/parts/${part.id}/components${component ? "/" + component.id : ""}`,
              component ? "PATCH" : "POST",
              {
                child_part_id: child,
                slot: slot.trim(),
                required_quantity: Number(quantity),
                is_optional: optional,
              },
            );
            onSaved();
          } catch (reason) {
            setError((reason as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          <ErrorMessage message={error} />
          {component && (
            <Text size="sm" c="dimmed">
              Current child:{" "}
              {component.child_part?.sku || component.child_part_id}
            </Text>
          )}
          <RecordPicker
            kind="parts"
            label="Child schema"
            value={child}
            onChange={setChild}
            exclude={part.id}
          />
          <TextInput
            label="Slot"
            placeholder="e.g. motor, left-wheel"
            required
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          />
          <NumberInput
            label="Required quantity"
            description="Maximum items allowed in this slot"
            required
            min={1}
            allowDecimal={false}
            value={quantity}
            onChange={setQuantity}
          />
          <Checkbox
            label="Optional component"
            checked={optional}
            onChange={(e) => setOptional(e.target.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} type="submit">
              Save slot
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function ParentUsages({ parents }: { parents?: Component[] }) {
  if (!parents?.length) return null;
  return (
    <Card withBorder p="lg" mb="lg">
      <Group gap="sm" mb="xs">
        <GitBranch size={20} color="#25856b" />
        <Title order={3}>Used by parent schemas</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        This schema appears in these bills of materials.
      </Text>
      <Table.ScrollContainer minWidth={550}>
        <Table verticalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Parent schema</Table.Th>
              <Table.Th>Slot</Table.Th>
              <Table.Th>Quantity cap</Table.Th>
              <Table.Th>Requirement</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {parents.map((component) => (
              <Table.Tr key={component.id}>
                <Table.Td>
                  <Group gap="sm">
                    <Link
                      className="record-link"
                      to={"/parts/" + component.parent_part_id}
                    >
                      {component.parent_part?.name ||
                        component.parent_part_id.slice(0, 8)}
                    </Link>
                    {component.parent_part?.archived_at && (
                      <Badge variant="light" color="gray">
                        Archived
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {component.parent_part?.sku}
                  </Text>
                </Table.Td>
                <Table.Td>{component.slot}</Table.Td>
                <Table.Td>{component.required_quantity}</Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={component.is_optional ? "gray" : "teal"}
                  >
                    {component.is_optional ? "Optional" : "Required"}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
