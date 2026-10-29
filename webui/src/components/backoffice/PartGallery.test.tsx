import { screen } from "@testing-library/react";

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
});
