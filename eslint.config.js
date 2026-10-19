import tseslint from "typescript-eslint";
import { determinismRules } from "procgen/eslint-determinism";

export default tseslint.config({
  files: ["src/lib/**/*.ts", "src/worldgen/**/*.ts", "src/game/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.bench.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: determinismRules,
});
