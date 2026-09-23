// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ViewToggle } from "../ViewToggle";
import { useUIStore } from "../../store/ui";

describe("ViewToggle", () => {
  beforeEach(() => {
    useUIStore.setState({ viewMode: "mindmap" });
  });
  afterEach(cleanup);

  it("renders all four view tabs including Notelets", () => {
    render(<ViewToggle />);
    for (const label of ["YAML", "Split", "Mind-map", "Notelets"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active view's tab as aria-selected", () => {
    useUIStore.setState({ viewMode: "notelets" });
    render(<ViewToggle />);
    expect(screen.getByRole("tab", { name: "Notelets" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Mind-map" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("clicking a tab updates the store's viewMode", async () => {
    const user = userEvent.setup();
    render(<ViewToggle />);
    await user.click(screen.getByRole("tab", { name: "Notelets" }));
    expect(useUIStore.getState().viewMode).toBe("notelets");
    await user.click(screen.getByRole("tab", { name: "YAML" }));
    expect(useUIStore.getState().viewMode).toBe("yaml");
  });
});
