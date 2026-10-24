import tseslint from "typescript-eslint";
import { determinismRules } from "procgen/eslint-determinism";

export default tseslint.config({
  files: ["src/worldgen/**/*.ts", "src/game/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.bench.ts", "**/*.fixtures.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: determinismRules,
});
