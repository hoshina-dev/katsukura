import { fireEvent, screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { Pager } from "./Pager";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/units/A",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("q=sma&page=2"),
}));

describe("Pager", () => {
  beforeEach(() => replace.mockClear());

  it("jumps to a typed page on Enter, keeping other params", () => {
    render(<Pager page={2} pageCount={5} total={30} />);
    const input = screen.getByLabelText("Page");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/units/A?q=sma&page=4", {
      scroll: false,
    });
  });

  it("keeps the page within 1 to pageCount", () => {
    render(<Pager page={2} pageCount={5} total={30} />);
    const input = screen.getByLabelText("Page");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(replace).not.toHaveBeenCalled();
    expect(input).toHaveValue("2");
  });

  it("disables Previous on the first page", () => {
    render(<Pager page={1} pageCount={5} total={30} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
