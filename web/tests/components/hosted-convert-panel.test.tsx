import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostedConvertPanel } from "@/components/assets/HostedConvertPanel";
import { HOSTED_LOCAL_UNAVAILABLE_COPY } from "@/lib/hosted-convert";

vi.mock("wagmi", () => ({
  useConnection: () => ({ addresses: [], chainId: 1 }),
}));

vi.mock("@/hooks/useWriteFlow", () => ({
  useWriteFlow: () => ({ writeContract: vi.fn() }),
}));

vi.mock("@/hooks/useAcknowledgment", () => ({
  useAcknowledgment: () => ({ acknowledged: false }),
}));

describe("HostedConvertPanel", () => {
  it("omits convert when the hosted path is unavailable", () => {
    const { container } = render(<HostedConvertPanel market={null} signingAllowed />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(HOSTED_LOCAL_UNAVAILABLE_COPY)).toBeNull();
    expect(screen.queryByRole("button", { name: "CONVERT" })).toBeNull();
  });
});
