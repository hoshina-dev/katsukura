import { fireEvent, screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { useUnsavedChanges } from "./useUnsavedChanges";

function Page({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return (
    <a href="/elsewhere" onClick={(event) => event.preventDefault()}>
      Leave
    </a>
  );
}

describe("useUnsavedChanges", () => {
  const confirm = vi.spyOn(window, "confirm");
  beforeEach(() => confirm.mockReset());

  it("asks before an in-app link leaves a dirty page", () => {
    confirm.mockReturnValue(false);
    const onClick = vi.fn();
    document.addEventListener("click", onClick);
    render(<Page dirty />);
    fireEvent.click(screen.getByText("Leave"));
    expect(confirm).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    document.removeEventListener("click", onClick);
  });

  it("does not ask while nothing changed", () => {
    render(<Page dirty={false} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(confirm).not.toHaveBeenCalled();
  });
});
