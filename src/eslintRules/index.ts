import type { Rule } from "eslint";

import { assertExpectPairingRule } from "./assertExpectPairing.js";
import { entryPointFactoryRule } from "./entryPointFactory.js";
import { locatorGetterShapeRule } from "./locatorGetterShape.js";
import { noAnySharedStateRule } from "./noAnySharedState.js";
import { noExpectInFlowsRule } from "./noExpectInFlows.js";
import { noFetchAxiosInFlowsRule } from "./noFetchAxiosInFlows.js";
import { noInlineLocatorInPageObjectRule } from "./noInlineLocatorInPageObject.js";
import { noLegacySelectorsRule } from "./noLegacySelectors.js";
import { noMutableStateInPageObjectRule } from "./noMutableStateInPageObject.js";
import { noPageObjectConstructorRule } from "./noPageObjectConstructor.js";
import { noRawPageInFlowsRule } from "./noRawPageInFlows.js";
import { noSelectorsInFlowsRule } from "./noSelectorsInFlows.js";
import { noWaitForTimeoutRule } from "./noWaitForTimeout.js";
import { preferWebFirstAssertionRule } from "./preferWebFirstAssertion.js";
import { requireLocatorJsdocRule } from "./requireLocatorJsdoc.js";
import { requirePageObjectBaseClassRule } from "./requirePageObjectBaseClass.js";
import { requireValueImportForCreatedPageRule } from "./requireValueImportForCreatedPage.js";
import type { PomLintRule } from "./types.js";

const rules: PomLintRule[] = [
  // The flow / page-object boundary.
  noExpectInFlowsRule,
  noFetchAxiosInFlowsRule,
  noRawPageInFlowsRule,
  noSelectorsInFlowsRule,
  noAnySharedStateRule,

  // Page-object shape and correctness.
  assertExpectPairingRule,
  entryPointFactoryRule,
  locatorGetterShapeRule,
  noInlineLocatorInPageObjectRule,
  noLegacySelectorsRule,
  noMutableStateInPageObjectRule,
  noPageObjectConstructorRule,
  noWaitForTimeoutRule,
  preferWebFirstAssertionRule,
  requireLocatorJsdocRule,
  requirePageObjectBaseClassRule,
  requireValueImportForCreatedPageRule,
];

const entries = rules.map((rule) => ({
  ...rule,
  id: `@qawolf/pom/${rule.name}`,
}));

export const pomRuleModules: Record<string, Rule.RuleModule> =
  Object.fromEntries(entries.map(({ id, module }) => [id, module]));

export const pomRuleSeverities: Record<string, PomLintRule["severity"]> =
  Object.fromEntries(entries.map(({ id, severity }) => [id, severity]));
