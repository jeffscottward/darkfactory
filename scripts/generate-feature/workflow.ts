import { applyGenerationPlan } from "./apply.ts";
import { parseGeneratorArguments } from "./parse.ts";
import { createGenerationPlan } from "./plan.ts";
import { createGenerationReport } from "./report.ts";
import type {
  GenerationPlan,
  GenerationReport,
  GeneratorArguments,
  VerificationResult,
} from "./types.ts";
import { validateFeatureName } from "./validate.ts";
import { verifyGeneration } from "./verify.ts";

export type GenerateFeatureOptions = Readonly<{
  targetRoot: string;
}>;

export type GenerateFeatureResult = Readonly<{
  arguments: GeneratorArguments;
  plan: GenerationPlan;
  report: GenerationReport;
  verification?: VerificationResult;
}>;

export const generateFeature = async (
  arguments_: readonly string[],
  options: GenerateFeatureOptions
): Promise<GenerateFeatureResult> => {
  const parsed = parseGeneratorArguments(arguments_);
  const names = validateFeatureName(parsed.name);
  const plan = await createGenerationPlan(options.targetRoot, names);

  if (parsed.dryRun) {
    return Object.freeze({
      arguments: parsed,
      plan,
      report: createGenerationReport(plan, "planned", true),
    });
  }

  let verification: VerificationResult | undefined;
  const application = await applyGenerationPlan(plan, {
    afterPromotion: async () => {
      verification = await verifyGeneration(plan);
    },
  });
  if (!verification)
    throw new Error("Generation verification did not complete");

  return Object.freeze({
    arguments: parsed,
    plan,
    verification,
    report: createGenerationReport(plan, "applied", false, application.cleanup),
  });
};
