"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { PartPrices, SubmitResult } from "@/app/actions";
import type { Metadata, Money } from "@/libs/inventory";

import { ChangedLabel, MetadataFields, useMetadataForm } from "./Metadata";
import { Section } from "./Section";
import { useUnsavedChanges } from "./useUnsavedChanges";

export type PriceFields = {
  compositePrice: Money;
  unitPrice: Money | null;
  // False when the unit has a bill of materials: composite is calculated
  editableComposite: boolean;
};

interface DetailsEditorProps {
  title: string;
  // Optional required name, saved trimmed
  name?: string;
  // Optional text field saved next to the metadata; blank saves null
  text?: { label: string; value: string | null };
  metadata: Metadata;
  prices?: PriceFields;
  // Server action bound to the part or item being edited
  save: (
    metadata: Record<string, unknown>,
    text: string | null,
    name?: string,
    prices?: PartPrices,
  ) => Promise<SubmitResult>;
}

function moneyInput(value: string | number): string {
  if (value === "" || value === undefined || value === null) return "";
  return String(value);
}

// Save validates on the backend; schema errors show on their fields
export function DetailsEditor({
  title,
  name: initialName,
  text,
  metadata,
  prices: initialPrices,
  save,
}: DetailsEditorProps) {
  const router = useRouter();
  const form = useMetadataForm(metadata);
  const [value, setValue] = useState(text?.value ?? "");
  const [savedValue, setSavedValue] = useState(value.trim());
  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState(name.trim());
  const nameChanged = initialName !== undefined && name.trim() !== savedName;
  const [composite, setComposite] = useState<string | number>(
    initialPrices?.compositePrice ?? "0.00",
  );
  const [unit, setUnit] = useState<string | number>(
    initialPrices?.unitPrice ?? "",
  );
  const [savedComposite, setSavedComposite] = useState(
    initialPrices?.compositePrice ?? "0.00",
  );
  const [savedUnit, setSavedUnit] = useState(initialPrices?.unitPrice ?? "");
  // Remount does not happen when the last BOM row is removed; reset composite
  // draft/baseline when leaf vs assembly mode flips so a stale calculated total
  // is not written as the new leaf price.
  const editableComposite = initialPrices?.editableComposite;
  const prevEditableComposite = useRef(editableComposite);
  useEffect(() => {
    if (initialPrices === undefined) {
      prevEditableComposite.current = undefined;
      return;
    }
    if (prevEditableComposite.current !== initialPrices.editableComposite) {
      setComposite(initialPrices.compositePrice);
      setSavedComposite(initialPrices.compositePrice);
      prevEditableComposite.current = initialPrices.editableComposite;
    } else if (!initialPrices.editableComposite) {
      setComposite(initialPrices.compositePrice);
      setSavedComposite(initialPrices.compositePrice);
    }
  }, [initialPrices]);
  const compositeChanged =
    initialPrices !== undefined &&
    initialPrices.editableComposite &&
    moneyInput(composite) !== savedComposite;
  const unitChanged =
    initialPrices !== undefined && moneyInput(unit) !== savedUnit;
  const [justSaved, setJustSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textChanged = value.trim() !== savedValue;
  const dirty =
    form.dirty || textChanged || nameChanged || compositeChanged || unitChanged;

  useUnsavedChanges(dirty);

  return (
    <Section
      title={title}
      actions={
        dirty && (
          <Badge color="orange" variant="light" radius="sm">
            Unsaved changes
          </Badge>
        )
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = form.toMetadata();
          if (parsed.error !== undefined) {
            setError(parsed.error);
            return;
          }
          if (initialName !== undefined && !name.trim()) {
            setError("Name is required");
            return;
          }
          const prices: PartPrices | undefined = initialPrices
            ? {
                unit_price: moneyInput(unit) === "" ? null : moneyInput(unit),
                ...(initialPrices.editableComposite
                  ? {
                      composite_price:
                        moneyInput(composite) === ""
                          ? null
                          : moneyInput(composite),
                    }
                  : {}),
              }
            : undefined;
          startTransition(async () => {
            // Throwing would replace the form with the error page and lose the draft
            const result = await save(
              parsed.metadata,
              value.trim() || null,
              initialName === undefined ? undefined : name.trim(),
              prices,
            ).catch(
              (): SubmitResult => ({
                error: "Could not save. Check your connection and try again.",
              }),
            );
            setFieldErrors(result.fields ?? {});
            setError(
              result.error ??
                (result.fields?.[""] || null) ??
                (result.fields ? "Some fields need fixing" : null),
            );
            if (!result.error && !result.fields) {
              form.commit();
              setSavedValue(value.trim());
              setSavedName(name.trim());
              // Clearing composite sends null and stores 0; keep draft and
              // baseline aligned so the form is not left dirty after save.
              const nextComposite = moneyInput(composite) || "0.00";
              setComposite(nextComposite);
              setSavedComposite(nextComposite);
              setSavedUnit(moneyInput(unit));
              setJustSaved(true);
              router.refresh();
            }
          });
        }}
        onChange={() => setJustSaved(false)}
      >
        <Stack gap="md">
          {initialName !== undefined && (
            <TextInput
              label={<ChangedLabel changed={nameChanged}>Name</ChangedLabel>}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              error={fieldErrors.name}
              required
            />
          )}
          {text && (
            <Textarea
              label={
                <ChangedLabel changed={textChanged}>{text.label}</ChangedLabel>
              }
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              autosize
              minRows={2}
            />
          )}
          {initialPrices && (
            <Stack gap="sm">
              <NumberInput
                label={
                  <ChangedLabel changed={compositeChanged}>
                    Composite price
                  </ChangedLabel>
                }
                description={
                  initialPrices.editableComposite
                    ? "Cost of this unit on its own"
                    : "Sum of the bill of materials"
                }
                value={
                  initialPrices.editableComposite
                    ? composite
                    : initialPrices.compositePrice
                }
                onChange={setComposite}
                decimalScale={2}
                fixedDecimalScale
                min={0}
                step={0.01}
                disabled={!initialPrices.editableComposite}
                error={fieldErrors.composite_price}
              />
              <NumberInput
                label={
                  <ChangedLabel changed={unitChanged}>Unit price</ChangedLabel>
                }
                description="Defaults to the composite price when left blank"
                placeholder={String(
                  initialPrices.editableComposite
                    ? moneyInput(composite) || initialPrices.compositePrice
                    : initialPrices.compositePrice,
                )}
                value={unit}
                onChange={setUnit}
                decimalScale={2}
                fixedDecimalScale
                min={0}
                step={0.01}
                error={fieldErrors.unit_price}
              />
            </Stack>
          )}
          <MetadataFields
            form={form}
            fieldErrors={fieldErrors}
            compact
            trackChanges
          />
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          {/* Sticks to the viewport bottom while there is something to save */}
          <Box
            pos={dirty ? "sticky" : undefined}
            bottom={0}
            bg="white"
            py="sm"
            mx="-md"
            px="md"
            mb="-md"
            style={{
              zIndex: 2,
              borderTop: dirty ? "1px solid var(--app-line)" : undefined,
            }}
          >
            <Group justify="flex-end" gap="sm">
              {dirty && (
                <Text size="sm" c="orange.8">
                  Unsaved changes
                </Text>
              )}
              {justSaved && !dirty && (
                <Text size="sm" c="signal.8">
                  Saved
                </Text>
              )}
              <Button
                type="submit"
                size="sm"
                loading={pending}
                disabled={!dirty}
              >
                Save details
              </Button>
            </Group>
          </Box>
        </Stack>
      </form>
    </Section>
  );
}
