"use client";

import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { type SyntheticEvent, useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  type Crop,
  makeAspectCrop,
  type PixelCrop,
} from "react-image-crop";

import { MAX_IMAGE_BYTES } from "@/libs/inventory";

// Ported from mapfox's AvatarCropModal; part photos keep more pixels
const MAX_EDGE = 1600;
const QUALITIES = [0.85, 0.7, 0.55];
const ASPECTS: Record<string, number | undefined> = {
  "4:3": 4 / 3,
  Square: 1,
  Free: undefined,
};

function initialCrop(width: number, height: number, aspect?: number): Crop {
  if (!aspect) return { unit: "%", x: 0, y: 0, width: 100, height: 100 };
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
    width,
    height,
  );
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
}

// Draws the crop at up to MAX_EDGE and steps down WebP quality to fit 1 MB
async function cropToFile(
  image: HTMLImageElement,
  crop: PixelCrop,
  name: string,
) {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const width = crop.width * scaleX;
  const height = crop.height * scaleY;
  const fit = Math.min(1, MAX_EDGE / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * fit);
  canvas.height = Math.round(height * fit);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const base = name.replace(/\.[^/.]+$/, "");
  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      return new File([blob], `${base}.webp`, { type: "image/webp" });
    }
  }
  return null;
}

interface ImageCropModalProps {
  file: File;
  // Position in the batch being cropped, e.g. 2 of 3
  index: number;
  count: number;
  onDone: (cropped: File) => void;
  onSkip: () => void;
}

export function ImageCropModal({
  file,
  index,
  count,
  onDone,
  onSkip,
}: ImageCropModalProps) {
  const [src] = useState(() => URL.createObjectURL(file));
  const [aspectLabel, setAspectLabel] = useState("4:3");
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
  const [saving, setSaving] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const aspect = ASPECTS[aspectLabel];

  const reset = (label: string) => {
    const img = image.current;
    if (!img) return;
    const next = initialCrop(img.width, img.height, ASPECTS[label]);
    setCrop(next);
    setPixelCrop(convertToPixelCrop(next, img.width, img.height));
  };

  const finish = (result: File | "skip") => {
    URL.revokeObjectURL(src);
    if (result === "skip") onSkip();
    else onDone(result);
  };

  const save = async () => {
    if (!image.current || !pixelCrop?.width || !pixelCrop.height) return;
    setSaving(true);
    const cropped = await cropToFile(image.current, pixelCrop, file.name);
    setSaving(false);
    if (cropped) finish(cropped);
    else setTooLarge(true);
  };

  return (
    <Modal
      opened
      onClose={() => finish("skip")}
      title={count > 1 ? `Crop image ${index} of ${count}` : "Crop image"}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between" gap="sm">
          <Text size="xs" c="dimmed" truncate maw={260}>
            {file.name}
          </Text>
          <SegmentedControl
            size="xs"
            aria-label="Aspect ratio"
            data={Object.keys(ASPECTS)}
            value={aspectLabel}
            onChange={(label) => {
              setAspectLabel(label);
              reset(label);
            }}
          />
        </Group>
        <Group
          justify="center"
          bg="#ecece8"
          p="xs"
          style={{ borderRadius: 4 }}
        >
          <ReactCrop
            crop={crop}
            onChange={(_, percent) => setCrop(percent)}
            onComplete={(pixels) => setPixelCrop(pixels)}
            aspect={aspect}
            keepSelection
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={image}
              src={src}
              alt="Crop preview"
              onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
                const { width, height } = event.currentTarget;
                const next = initialCrop(width, height, aspect);
                setCrop(next);
                setPixelCrop(convertToPixelCrop(next, width, height));
              }}
              style={{ maxHeight: 420, maxWidth: "100%", display: "block" }}
            />
          </ReactCrop>
        </Group>
        {tooLarge && (
          <Text size="xs" c="red.8">
            Even compressed, this crop is over 1 MB. Choose a smaller area.
          </Text>
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={() => finish("skip")}>
            {count > 1 ? "Skip this image" : "Cancel"}
          </Button>
          <Button onClick={save} loading={saving} disabled={!pixelCrop?.width}>
            Crop and upload
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
