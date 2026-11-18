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
    composite_price: "0.00",
    unit_price: null,
    effective_unit_price: "0.00",
    archived_at: null,
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
});
