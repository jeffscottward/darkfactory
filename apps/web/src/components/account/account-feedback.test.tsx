// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  type AccountFeedback,
  AccountFeedbackMessage,
} from "./account-feedback.tsx";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("account feedback success pulse", () => {
  it("remounts the message for each new feedback so the pulse replays", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const render = (feedback: AccountFeedback | null) =>
      act(() => root.render(<AccountFeedbackMessage feedback={feedback} />));

    render({ message: "Saved.", tone: "success" });
    const first = host.querySelector("p");
    expect(first?.className).toContain("animate-success-pulse");

    render({ message: "Saved.", tone: "success" });
    const second = host.querySelector("p");
    expect(second?.textContent).toBe("Saved.");
    expect(second).not.toBe(first);

    act(() => root.render(<AccountFeedbackMessage feedback={null} />));
    expect(host.querySelector("p")).toBeNull();
    act(() => root.unmount());
  });

  it("keeps the same element when the feedback object does not change", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const feedback: AccountFeedback = { message: "Saved.", tone: "success" };
    act(() => root.render(<AccountFeedbackMessage feedback={feedback} />));
    const first = host.querySelector("p");
    act(() => root.render(<AccountFeedbackMessage feedback={feedback} />));
    expect(host.querySelector("p")).toBe(first);
    act(() => root.unmount());
  });
});
