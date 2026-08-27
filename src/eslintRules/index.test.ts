import { pomRuleModules, pomRuleSeverities } from "./index.js";

// The published surface: consumers enable by the id in pomRuleSeverities and
// register the module under the same id in pomRuleModules.
it("exposes each rule under its scoped id, with its severity", () => {
  const ruleId = "@qawolf/pom/no-inline-locator-in-page-object";

  expect(Object.keys(pomRuleModules)).toContain(ruleId);
  expect(pomRuleSeverities[ruleId]).toBe("warn");
});

// A consumer spreads `pomRuleSeverities` into its config; pinning the whole
// table means adding, renaming or re-grading a rule is a visible diff here.
it("ships this rule set", () => {
  expect(pomRuleSeverities).toEqual({
    "@qawolf/pom/assert-expect-pairing": "error",
    "@qawolf/pom/entry-point-factory": "error",
    "@qawolf/pom/locator-getter-shape": "error",
    "@qawolf/pom/no-any-shared-state": "error",
    "@qawolf/pom/no-expect-in-flows": "warn",
    "@qawolf/pom/no-fetch-axios-in-flows": "error",
    "@qawolf/pom/no-inline-locator-in-page-object": "warn",
    "@qawolf/pom/no-legacy-selectors": "error",
    "@qawolf/pom/no-mutable-state-in-page-object": "warn",
    "@qawolf/pom/no-page-object-constructor": "error",
    "@qawolf/pom/no-raw-page-in-flows": "error",
    "@qawolf/pom/no-selectors-in-flows": "error",
    "@qawolf/pom/no-wait-for-timeout": "error",
    "@qawolf/pom/prefer-web-first-assertion": "warn",
    "@qawolf/pom/require-locator-jsdoc": "warn",
    "@qawolf/pom/require-page-object-base-class": "warn",
    "@qawolf/pom/require-value-import-for-created-page": "error",
  });
  expect(Object.keys(pomRuleModules).sort()).toEqual(
    Object.keys(pomRuleSeverities).sort(),
  );
});

// Every rule reports through `meta.messages`, so a consumer's ESLint can
// render any report it produces.
it("gives every rule a message catalogue", () => {
  for (const [id, module] of Object.entries(pomRuleModules)) {
    expect({ id, messages: Object.keys(module.meta?.messages ?? {}) }).toEqual({
      id,
      messages: expect.arrayContaining([expect.any(String)]),
    });
  }
});
