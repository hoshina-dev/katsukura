import { useState } from "react";
import {
  Button,
  Group,
  JsonInput,
  Modal,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { api, metadataFields, type Item, type Part } from "./api";
import { ErrorMessage } from "./ui";
import { RecordPicker } from "./picker";
export function EntityForm({
  kind,
  entity,
  onClose,
  onSaved,
}: {
  kind: "parts" | "inventory";
  entity?: Part | Item;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const part = kind === "parts" ? (entity as Part | undefined) : undefined;
  const item = kind === "inventory" ? (entity as Item | undefined) : undefined;
  const [sku, setSku] = useState(part?.sku || "");
  const [name, setName] = useState(part?.name || "");
  const [description, setDescription] = useState(part?.description || "");
  const [partID, setPartID] = useState(item?.part_id || "");
  const [serial, setSerial] = useState(item?.serial_number || "");
  const [location, setLocation] = useState(item?.location || "");
  const [state, setState] = useState<string>(item?.assembly_state || "draft");
  const [initialMetadata] = useState(() =>
    JSON.stringify(entity?.metadata || {}, null, 2),
  );
  const [metadata, setMetadata] = useState(initialMetadata);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const metadataPayload = metadataFields(
        metadata,
        entity ? initialMetadata : undefined,
      );
      const body =
        kind === "parts"
          ? {
              sku: sku.trim(),
              name: name.trim(),
              description: description.trim() || null,
              ...metadataPayload,
            }
          : {
              ...(!item ? { part_id: partID } : {}),
              serial_number: serial.trim() || null,
              location: location.trim() || null,
              assembly_state: state,
              ...metadataPayload,
            };
      const result = await api<Part | Item>(
        "/" + kind + (entity ? "/" + entity.id : ""),
        entity ? "PATCH" : "POST",
        body,
      );
      onSaved(result.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={`${entity ? "Edit" : "New"} ${kind === "parts" ? "part schema" : "inventory item"}`}
      size="lg"
    >
      <form onSubmit={save}>
        <Stack>
          <ErrorMessage message={error} />
          {kind === "parts" ? (
            <>
              <TextInput
                label="SKU"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
              <TextInput
                label="Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </>
          ) : (
            <>
              {item ? (
                <TextInput
                  label="Part schema"
                  value={item.part?.sku || item.part_id}
                  disabled
                />
              ) : (
                <RecordPicker
                  kind="parts"
                  label="Part schema"
                  value={partID}
                  onChange={setPartID}
                />
              )}
              <TextInput
                label="Serial number"
                description="Optional; unique within this SKU"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
              <TextInput
                label="Location"
                placeholder="e.g. Workshop / Shelf A"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Select
                label="Assembly state"
                description="Informational; items may always have missing components"
                data={[
                  { value: "draft", label: "Draft" },
                  { value: "complete", label: "Complete" },
                ]}
                value={state}
                onChange={(value) => setState(value || "draft")}
              />
            </>
          )}
          <JsonInput
            label="Metadata"
            description="A JSON object for your custom properties"
            value={metadata}
            onChange={setMetadata}
            formatOnBlur
            autosize
            minRows={5}
            validationError="Enter valid JSON"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save {kind === "parts" ? "schema" : "item"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
export function ConfirmArchive({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal opened onClose={onClose} title="Archive record">
      <Stack>
        <p>
          Archive {name}? You can restore it later. Active references may
          prevent archiving.
        </p>
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
                await onConfirm();
                onClose();
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Archive
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
