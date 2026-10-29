"use client";

import { Carousel, CarouselSlide } from "@mantine/carousel";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";

import { PartImage } from "./PartImage";

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

export function PartGallery({ images, alt }: PartGalleryProps) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <Frame>
        <PartImage src={images[0]} alt={alt} />
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
            <PartImage
              src={src}
              alt={`${alt} (${index + 1} of ${images.length})`}
            />
          </CarouselSlide>
        ))}
      </Carousel>
    </Frame>
  );
}
