import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DefaultHub } from "@/components/kit/DefaultHub";

const FORBIDDEN = /\b(APY|protocol|router|PT|market|route)\b/i;

describe("Default create disclosure", () => {
  it("offers three position types without protocol labels", () => {
    const { container } = render(<DefaultHub welcome="Choose a position type" />);
    const cards = container.querySelector(".default-hub-types");
    expect(cards?.textContent).toMatch(/Self-Repaying Loan/);
    expect(cards?.textContent).toMatch(/Fixed Return/);
    expect(cards?.textContent).toMatch(/Stream/);
    expect(container.querySelector("[data-type=loan]")).toHaveAttribute("href", "/borrow/");
    expect(container.querySelector("[data-type=fixed]")).toHaveAttribute("href", "/supply/");
    expect(container.querySelector("[data-type=stream]")).toHaveAttribute("href", "/create/stream/");
    expect(cards?.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});
