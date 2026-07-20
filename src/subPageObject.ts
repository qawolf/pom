import { BasePageObject } from "./basePageObject.js";

/**
 * The `TParent` generic exists for human readability and AST discoverability –
 * tooling can extract every `SubPageObject<X>`, build parent-child graphs, and
 * generate documentation automatically.
 */
export abstract class SubPageObject<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally unused: exists for AST discoverability (see doc comment)
  TParent extends BasePageObject,
> extends BasePageObject {}
