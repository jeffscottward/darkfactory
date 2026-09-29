"use client";

import { useEffect, useState } from "react";

import { PublicPage } from "../_components/public-content.tsx";
import PublicLoading from "../loading.tsx";

const recoveryMarker = "darkfactory:e2e:public-error-recovered";

export const RecoverableErrorFixture = () => {
  const [phase, setPhase] = useState<"checking" | "recovered" | "throw">(
    "checking"
  );

  useEffect(() => {
    if (window.sessionStorage.getItem(recoveryMarker) === "1") {
      setPhase("recovered");
      return undefined;
    }
    window.sessionStorage.setItem(recoveryMarker, "1");
    setPhase("throw");
  }, []);

  if (phase === "checking") return <PublicLoading />;
  if (phase === "throw")
    throw new Error("E2E recoverable public error fixture");

  return (
    <PublicPage
      description="The public error boundary reset the failed route without exposing it in production."
      eyebrow="E2E fixture"
      title="The error fixture recovered."
    >
      <p className="py-16 text-base text-muted-foreground leading-7">
        Recovery completed without submitting data or changing an account.
      </p>
    </PublicPage>
  );
};
