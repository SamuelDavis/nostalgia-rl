import tseslint from "typescript-eslint";
import { determinismRules } from "./packages/procgen/eslint-determinism.js";

export default tseslint.config({
  files: ["src/lib/**/*.ts", "src/worldgen/**/*.ts", "src/game/**/*.ts", "packages/procgen/{src,examples}/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.bench.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: determinismRules,
});
