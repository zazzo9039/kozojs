---
'@kozojs/cli': patch
---

Add the production `api-contract` template, deterministic feature generator,
architecture/contract checker (including `z.date()` wire-format warning), real
TypeScript lint gate, and Golden Path docs from the consumer pilot.

Note: the monorepo `fixed` changeset group will lockstep-bump every `@kozojs/*`
package to 0.7.1 on publish; only the CLI surface changes in this release.
