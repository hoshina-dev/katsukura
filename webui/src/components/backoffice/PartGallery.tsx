"use client";

import { Carousel, CarouselSlide } from "@mantine/carousel";
import { Box, UnstyledButton } from "@mantine/core";
import { type ReactNode, useState } from "react";

import { ImageViewer, PartImage } from "./PartImage";

interface PartGalleryProps {
  images: string[];
  alt: string;
}

// Bordered frame around the gallery
function Frame({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        border: "1px solid var(--app-line)",
        background: "#fff",
      }}
    >
      {children}
    </Box>
  );
}

// Opens the full image; the gallery crops it to 4:3
function Zoomable({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: (src: string) => void;
}) {
  return (
    <UnstyledButton
      display="block"
      w="100%"
      aria-label={`View full image: ${alt}`}
      onClick={() => onOpen(src)}
      style={{ cursor: "zoom-in" }}
    >
      {/* key: a new address must retry after the last one failed to load */}
      <PartImage key={src} src={src} alt={alt} />
    </UnstyledButton>
  );
}

export function PartGallery({ images, alt }: PartGalleryProps) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (images.length === 0) return null;
  const viewer = <ImageViewer src={viewing} onClose={() => setViewing(null)} />;
  if (images.length === 1) {
    return (
      <Frame>
        <Zoomable src={images[0]} alt={alt} onOpen={setViewing} />
        {viewer}
      </Frame>
    );
  }

  return (
    <Frame>
      <Carousel
        withIndicators
        emblaOptions={{ loop: true }}
        aria-label={`${alt} images`}
      >
        {images.map((src, index) => (
          <CarouselSlide key={`${index}-${src}`}>
            <Zoomable
              src={src}
              alt={`${alt} (${index + 1} of ${images.length})`}
              onOpen={setViewing}
            />
          </CarouselSlide>
        ))}
      </Carousel>
      {viewer}
    </Frame>
  );
}
