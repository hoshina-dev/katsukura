import { act, fireEvent, screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { CatalogToolbar } from "./CatalogControls";

const replace = vi.fn();
const push = vi.fn();
let search = "q=desk&page=2";
vi.mock("@/libs/nav", async (original) => ({
  ...(await original<typeof import("@/libs/nav")>()),
  usePathname: () => "/",
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(search),
}));

const box = () => screen.getByLabelText(/Search by name/);

describe("CatalogToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    push.mockClear();
    search = "q=desk&page=2";
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the page when the query only gained spaces", () => {
    render(<CatalogToolbar />);
    fireEvent.change(box(), { target: { value: "desk " } });
    act(() => vi.advanceTimersByTime(400));
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes the first change of a search, then replaces until blur", () => {
    render(<CatalogToolbar />);
    fireEvent.change(box(), { target: { value: "chair" } });
    act(() => vi.advanceTimersByTime(400));
    expect(push).toHaveBeenCalledWith("/?q=chair", { scroll: false });
    fireEvent.change(box(), { target: { value: "chairs" } });
    act(() => vi.advanceTimersByTime(400));
    expect(replace).toHaveBeenCalledWith("/?q=chairs", { scroll: false });
    fireEvent.blur(box());
    fireEvent.change(box(), { target: { value: "lamp" } });
    act(() => vi.advanceTimersByTime(400));
    expect(push).toHaveBeenLastCalledWith("/?q=lamp", { scroll: false });
  });

  it("shows the address's query after a link clears it", () => {
    const { rerender } = render(<CatalogToolbar />);
    expect(box()).toHaveValue("desk");
    search = "";
    rerender(<CatalogToolbar />);
    expect(box()).toHaveValue("");
    act(() => vi.advanceTimersByTime(400));
    // The old text is not written back
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
