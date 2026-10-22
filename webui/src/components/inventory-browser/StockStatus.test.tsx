import { screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { StockStatus, TypeLabel } from "./StockStatus";

describe("StockStatus", () => {
  it("shows availability", () => {
    render(<StockStatus count={2} />);
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("shows out of stock", () => {
    render(<StockStatus count={0} />);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("labels products and parts", () => {
    render(<TypeLabel isProduct />);
    expect(screen.getByText("Product")).toBeInTheDocument();
  });
});
