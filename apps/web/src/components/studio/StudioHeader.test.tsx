// @vitest-environment jsdom

import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudioHeader from "./StudioHeader";

vi.mock("../../hooks/useGuildName", () => ({
  useGuildName: () => "Test server",
}));

describe("StudioHeader", () => {
  it("does not render a Templates header control", () => {
    render(
      <MemoryRouter initialEntries={["/studio/guild-1"]}>
        <StudioHeader />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /templates/i })).not.toBeInTheDocument();
  });
});
