import { fireEvent, screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { Pager } from "./Pager";

const replace = vi.fn();
vi.mock("@/libs/nav", async (original) => ({
  ...(await original<typeof import("@/libs/nav")>()),
  usePathname: () => "/units/A",
  useRouter: () => ({ replace, push: vi.fn() }),
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

  it.each([
    ["Next", "4"],
    ["Previous", "4"],
  ])("keeps the typed page when %s is clicked after it", (button, typed) => {
    render(<Pager page={2} pageCount={5} total={30} />);
    const input = screen.getByLabelText("Page");
    fireEvent.change(input, { target: { value: typed } });
    // A click blurs the field before the button's handler runs
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/units/A?q=sma&page=${typed}`, {
      scroll: false,
    });
  });

  it("steps from the current page when nothing new was typed", () => {
    render(<Pager page={2} pageCount={5} total={30} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(replace).toHaveBeenCalledWith("/units/A?q=sma&page=3", {
      scroll: false,
    });
  });

  it("disables Previous on the first page", () => {
    render(<Pager page={1} pageCount={5} total={30} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
