import { screen } from "@testing-library/react";

import { render } from "@/tests/utils";

import { StockCounts } from "./StockCounts";

describe("StockCounts", () => {
  it("shows the total and how many are in use or available", () => {
    render(<StockCounts stock={{ total: 5, in_use: 3, available: 2 }} />);
    expect(screen.getByText("Total").textContent).toBe("Total 5");
    expect(screen.getByText("In use").textContent).toBe("In use 3");
    expect(screen.getByText("Available").textContent).toBe("Available 2");
  });
});
