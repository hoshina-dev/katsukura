import { screen } from "@testing-library/react";

import type { PartComponent } from "@/libs/inventory";
import { render } from "@/tests/utils";

import { AddItemsModal } from "./AddItemsModal";

const slot = (available: number): PartComponent => ({
  id: "slot-1",
  parent_part_id: "p",
  child_part_id: "c",
  slot: "leg",
  required_quantity: 2,
  child_part: {
    id: "c",
    sku: "LEG",
    name: "Leg",
    description: null,
    metadata: {},
    archived_at: null,
    serial_aware: true,
    stock: { total: available, in_use: 0, available },
  },
});

describe("AddItemsModal", () => {
  it("lists what each slot takes from stock", () => {
    render(
      <AddItemsModal
        count={3}
        slots={[slot(5)]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Taken from stock:")).toBeInTheDocument();
    expect(screen.getByText("6 of 5 free")).toBeInTheDocument();
  });

  it("skips the list for a unit without a bill of materials", () => {
    render(
      <AddItemsModal
        count={1}
        slots={[]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Taken from stock:")).not.toBeInTheDocument();
  });

  it("skips serial fields when the unit is not serial-aware", () => {
    render(
      <AddItemsModal
        count={2}
        slots={[]}
        serialAware={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText("Serial number for item 1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/generated serial number/i),
    ).not.toBeInTheDocument();
  });
});
