import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DefaultHub } from "@/components/kit/DefaultHub";
import { CreateFlowBack } from "@/components/kit/CreateFlowBack";
import {
  CREATE_CHOOSER_PATH,
  CREATE_RETURN_KEY,
  HOME_PATH,
  createReturnLabel,
  readCreateReturn,
} from "@/lib/create-return";

const FORBIDDEN = /\b(APY|protocol|router|PT|market|route)\b/i;

describe("Default create disclosure", () => {
  it("offers three position types without protocol labels", () => {
    const { container } = render(<DefaultHub welcome="Choose an OVRFLO" />);
    const cards = container.querySelector(".default-hub-types");
    expect(cards?.textContent).toMatch(/Self-Repaying Loan/);
    expect(cards?.textContent).toMatch(/Fixed Return/);
    expect(cards?.textContent).toMatch(/Stream/);
    expect(container.querySelector("[data-type=loan]")).toHaveAttribute("href", "/borrow/");
    expect(container.querySelector("[data-type=fixed]")).toHaveAttribute("href", "/supply/");
    expect(container.querySelector("[data-type=stream]")).toHaveAttribute("href", "/create/stream/");
    expect(container.querySelectorAll("[data-type=stream] svg circle")).toHaveLength(3);
    expect(container.querySelectorAll("[data-type=loan] svg circle")).toHaveLength(0);
    expect(cards?.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("puts a back breadcrumb on New position, not on empty start", () => {
    const { container, rerender } = render(
      <DefaultHub welcome="Choose an OVRFLO" backHref="/" backLabel="Your OVRFLO" />,
    );
    expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toHaveAttribute("href", "/");
    rerender(<DefaultHub welcome="Your OVRFLO starts here." />);
    expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toBeNull();
  });

  it("remembers empty start as the typed-create return", async () => {
    sessionStorage.clear();
    render(<DefaultHub welcome="Your OVRFLO starts here." returnHref={HOME_PATH} />);
    await waitFor(() => {
      expect(readCreateReturn()).toBe(HOME_PATH);
    });
    expect(createReturnLabel(readCreateReturn())).toBe("Your OVRFLO");
  });

  it("returns typed create to empty start, not New position", async () => {
    sessionStorage.setItem(CREATE_RETURN_KEY, HOME_PATH);
    const { container } = render(<CreateFlowBack />);
    await waitFor(() => {
      expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toHaveAttribute("href", "/");
    });
    expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toHaveTextContent("Your OVRFLO");
  });

  it("returns typed create to New position when that page opened the flow", async () => {
    sessionStorage.setItem(CREATE_RETURN_KEY, CREATE_CHOOSER_PATH);
    const { container } = render(<CreateFlowBack />);
    await waitFor(() => {
      expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toHaveAttribute(
        "href",
        "/create/",
      );
    });
    expect(container.querySelector("[data-ui='UI-SHELL-BREADCRUMB']")).toHaveTextContent(
      "Choose an OVRFLO",
    );
  });
});
