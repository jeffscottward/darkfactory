import type { Dispatch, SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  type Phase = "checking" | "recovered" | "throw";
  let phase: Phase = "checking";
  let effect: (() => void) | undefined;

  return {
    reset: () => {
      phase = "checking";
      return (effect = undefined);
    },
    runEffect: () => effect?.(),
    useEffect: (nextEffect: () => void): void => {
      effect = nextEffect;
    },
    useState: <Value>(
      _initial: Value
    ): readonly [Value, Dispatch<SetStateAction<Value>>] => [
      phase as Value,
      ((next: SetStateAction<Value>) => {
        return (phase = (
          typeof next === "function"
            ? (next as (current: Value) => Value)(phase as Value)
            : next
        ) as Phase);
      }) as Dispatch<SetStateAction<Value>>,
    ],
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: hooks.useEffect,
    useState: hooks.useState,
  };
});

import { PublicPage } from "../_components/public-content.tsx";
import PublicLoading from "../loading.tsx";
import { RecoverableErrorFixture } from "./recoverable-error-fixture.tsx";

beforeEach(() => hooks.reset());

afterEach(() => vi.unstubAllGlobals());

describe("recoverable public error fixture", () => {
  it("marks the first visit and throws only after the checking phase", () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { getItem, setItem },
    });

    const checking = RecoverableErrorFixture();
    expect(checking.type).toBe(PublicLoading);

    expect(hooks.runEffect()).toBeUndefined();
    expect(getItem).toHaveBeenCalledWith(
      "darkfactory:e2e:public-error-recovered"
    );
    expect(setItem).toHaveBeenCalledWith(
      "darkfactory:e2e:public-error-recovered",
      "1"
    );
    return expect(() => RecoverableErrorFixture()).toThrow(
      "E2E recoverable public error fixture"
    );
  });

  return it("renders bounded recovery content when the visit marker already exists", () => {
    const getItem = vi.fn(() => "1");
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { getItem, setItem },
    });

    expect(RecoverableErrorFixture().type).toBe(PublicLoading);
    expect(hooks.runEffect()).toBeUndefined();

    const recovered = RecoverableErrorFixture();
    expect(recovered.type).toBe(PublicPage);
    expect(recovered.props).toMatchObject({
      description:
        "The public error boundary reset the failed route without exposing it in production.",
      eyebrow: "E2E fixture",
      title: "The error fixture recovered.",
    });
    return expect(setItem).not.toHaveBeenCalled();
  });
});
