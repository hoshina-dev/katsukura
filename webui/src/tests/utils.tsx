import { MantineProvider } from "@mantine/core";
import {
  render as testingLibraryRender,
  RenderResult,
} from "@testing-library/react";
import { ReactNode } from "react";

import { theme } from "../libs/theme";

export function render(ui: ReactNode): RenderResult {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MantineProvider theme={theme} env="test">
        {children}
      </MantineProvider>
    ),
  });
}
