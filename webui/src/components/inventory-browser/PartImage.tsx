"use client";

import { AspectRatio, Center, Image } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface PartImageProps {
  src: string | null;
  alt: string;
  ratio?: number;
  radius?: string;
}

export function PartImage({ src, alt, ratio = 4 / 3, radius }: PartImageProps) {
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
        <Center bg="gray.1" style={{ borderRadius: radius }} aria-label={alt}>
          <IconPhoto size={28} color="var(--mantine-color-gray-5)" />
        </Center>
      )}
    </AspectRatio>
  );
}
