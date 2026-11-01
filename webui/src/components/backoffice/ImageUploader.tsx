"use client";

import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
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
  // Previews are cropped to fit; this shows the image at its own ratio
  const [viewing, setViewing] = useState<string | null>(null);

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
        <SimpleGrid cols={4} spacing="xs">
          {value.map((url, index) => (
            // The cover spans the row at the gallery's 4:3, like it will show
            <Box
              key={url}
              pos="relative"
              style={index === 0 ? { gridColumn: "1 / -1" } : undefined}
            >
              <UnstyledButton
                display="block"
                w="100%"
                aria-label={`View image ${index + 1}`}
                onClick={() => setViewing(url)}
                style={{ cursor: "zoom-in" }}
              >
                <PartImage
                  src={url}
                  alt={`Image ${index + 1}`}
                  ratio={index === 0 ? 4 / 3 : 1}
                  radius="sm"
                />
              </UnstyledButton>
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
              style={{
                display: "grid",
                placeItems: "center",
                ...(value.length === 0 && i === 0
                  ? { gridColumn: "1 / -1", aspectRatio: "4 / 3" }
                  : { aspectRatio: "1" }),
              }}
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
      <Modal
        opened={viewing !== null}
        onClose={() => setViewing(null)}
        size="auto"
        centered
        withCloseButton={false}
        padding={0}
      >
        {viewing && (
          <Image
            src={viewing}
            alt="Full image"
            fit="contain"
            maw="90vw"
            mah="85vh"
            w="auto"
            onClick={() => setViewing(null)}
          />
        )}
      </Modal>
      {errors.map((line) => (
        <Text key={line} size="xs" c="red.8">
          {line}
        </Text>
      ))}
    </Stack>
  );
}
