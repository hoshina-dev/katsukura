"use client";

import { Carousel, CarouselSlide } from "@mantine/carousel";

import { PartImage } from "./PartImage";

interface PartGalleryProps {
  images: string[];
  alt: string;
}

export function PartGallery({ images, alt }: PartGalleryProps) {
  if (images.length === 0) return null;
  if (images.length === 1) return <PartImage src={images[0]} alt={alt} />;

  return (
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
  );
}
