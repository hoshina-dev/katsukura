"use client";

import { AspectRatio, Center, Image, Modal } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface PartImageProps {
  src: string | null;
  alt: string;
  ratio?: number;
  radius?: string;
  iconSize?: number;
}

export function PartImage({
  src,
  alt,
  ratio = 4 / 3,
  radius,
  iconSize = 28,
}: PartImageProps) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError
  useEffect(() => {
    const img = image.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  return (
    <AspectRatio ratio={ratio}>
      {src && !failed ? (
        <Image
          ref={image}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fit="cover"
          radius={radius}
          onError={() => setFailed(true)}
        />
      ) : (
        <Center
          bg="#ecece8"
          style={{ borderRadius: radius }}
          aria-label={alt || undefined}
        >
          <IconPhoto size={iconSize} stroke={1.5} color="#a3a39c" />
        </Center>
      )}
    </AspectRatio>
  );
}

// The whole image at its own ratio; previews are cropped to fit
export function ImageViewer({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={src !== null}
      onClose={onClose}
      size="auto"
      centered
      withCloseButton={false}
      padding={0}
    >
      {src && (
        <Image
          src={src}
          alt="Full image"
          fit="contain"
          maw="90vw"
          mah="85vh"
          w="auto"
          onClick={onClose}
        />
      )}
    </Modal>
  );
}
