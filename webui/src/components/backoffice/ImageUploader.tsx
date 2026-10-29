"use client";

import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconPhotoPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { uploadPartImage } from "@/app/actions";
import { IMAGE_TYPES } from "@/libs/inventory";

import { ImageCropModal } from "./ImageCropModal";
import { PartImage } from "./PartImage";

// Originals are cropped and compressed to under 1 MB before upload
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

interface ImageUploaderProps {
  value: string[];
  onChange: (update: (urls: string[]) => string[]) => void;
}

// Picked files are cropped one by one, then each goes to R2 straight away;
// the form keeps only URLs
export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [queue, setQueue] = useState<{ files: File[]; at: number } | null>(
    null,
  );
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const pick = (files: File[]) => {
    const problems: string[] = [];
    const accepted = files.filter((file) => {
      if (!IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name}: use a JPEG, PNG or WebP image`);
      } else if (file.size > MAX_SOURCE_BYTES) {
        problems.push(`${file.name} is larger than 20 MB`);
      } else {
        return true;
      }
      return false;
    });
    setErrors(problems);
    if (accepted.length > 0) setQueue({ files: accepted, at: 0 });
  };

  const next = () =>
    setQueue((current) =>
      current && current.at + 1 < current.files.length
        ? { ...current, at: current.at + 1 }
        : null,
    );

  const upload = async (file: File) => {
    setUploading((n) => n + 1);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadPartImage(form).catch(() => ({
      url: undefined,
      error: `${file.name} could not be uploaded`,
    }));
    setUploading((n) => n - 1);
    if (result.url) onChange((urls) => [...urls, result.url!]);
    else setErrors((current) => [...current, result.error ?? file.name]);
  };

  return (
    <Stack gap="xs">
      {(value.length > 0 || uploading > 0) && (
        <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="xs">
          {value.map((url, index) => (
            <Box key={url} pos="relative">
              <PartImage
                src={url}
                alt={`Image ${index + 1}`}
                ratio={1}
                radius="sm"
              />
              <ActionIcon
                pos="absolute"
                top={4}
                right={4}
                size="sm"
                variant="white"
                color="gray"
                aria-label={`Remove image ${index + 1}`}
                onClick={() =>
                  onChange((urls) => urls.filter((other) => other !== url))
                }
              >
                <IconX size={14} />
              </ActionIcon>
              {index === 0 && (
                <Text
                  size="xs"
                  pos="absolute"
                  bottom={4}
                  left={4}
                  px={6}
                  bg="white"
                  style={{ borderRadius: 3 }}
                >
                  Cover
                </Text>
              )}
            </Box>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <Box
              key={`uploading-${i}`}
              className="panel"
              style={{ aspectRatio: "1", display: "grid", placeItems: "center" }}
            >
              <Loader size="sm" />
            </Box>
          ))}
        </SimpleGrid>
      )}
      <Group gap="sm">
        <FileButton onChange={pick} accept={IMAGE_TYPES.join(",")} multiple>
          {(props) => (
            <Button
              {...props}
              variant="default"
              size="sm"
              leftSection={<IconPhotoPlus size={16} />}
            >
              Upload images
            </Button>
          )}
        </FileButton>
        <Text size="xs" c="dimmed">
          JPEG, PNG or WebP. You crop each one before it uploads; the first
          image is the cover.
        </Text>
      </Group>
      {queue && (
        <ImageCropModal
          key={`${queue.at}-${queue.files[queue.at].name}`}
          file={queue.files[queue.at]}
          index={queue.at + 1}
          count={queue.files.length}
          onDone={(cropped) => {
            next();
            upload(cropped);
          }}
          onSkip={next}
        />
      )}
      {errors.map((line) => (
        <Text key={line} size="xs" c="red.8">
          {line}
        </Text>
      ))}
    </Stack>
  );
}
