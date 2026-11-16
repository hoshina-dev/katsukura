import { fireEvent, screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { PartGallery } from "./PartGallery";

describe("PartGallery", () => {
  it("renders nothing without images", () => {
    render(<PartGallery images={[]} alt="Desk" />);
    expect(screen.queryByLabelText("Desk")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows a single image without a carousel", () => {
    render(<PartGallery images={["https://x/a.jpg"]} alt="Desk" />);
    expect(screen.getByRole("img", { name: "Desk" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Desk images")).not.toBeInTheDocument();
  });

  it("shows every image in a carousel", () => {
    render(
      <PartGallery
        images={["https://x/a.jpg", "https://x/b.jpg"]}
        alt="Desk"
      />,
    );
    expect(screen.getByLabelText("Desk images")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Desk (1 of 2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Desk (2 of 2)" }),
    ).toBeInTheDocument();
  });

  it("opens the full image", () => {
    render(<PartGallery images={["https://x/a.jpg"]} alt="Desk" />);
    fireEvent.click(screen.getByLabelText("View full image: Desk"));
    expect(screen.getByRole("img", { name: "Full image" })).toBeInTheDocument();
  });

  it("loads a replacement after the previous image failed", () => {
    const { rerender } = render(
      <PartGallery images={["https://x/a.jpg"]} alt="Desk" />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Desk" }));
    expect(screen.queryByRole("img", { name: "Desk" })).not.toBeInTheDocument();
    rerender(<PartGallery images={["https://x/b.jpg"]} alt="Desk" />);
    expect(screen.getByRole("img", { name: "Desk" })).toHaveAttribute(
      "src",
      "https://x/b.jpg",
    );
  });
});
