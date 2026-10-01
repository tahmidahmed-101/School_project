import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Layering: app -> modules -> design-system -> lib. Nothing may import "upwards", and a module's internals are
// private: other code goes through `@/modules/<name>` (client-safe) or `@/modules/<name>/server` (server-only data).
const deepModuleImport = {
  // The negation keeps each module's server.ts barrel importable.
  group: ["@/modules/*/*", "!@/modules/*/server"],
  message: "Import another module through its public API: @/modules/<name> (or @/modules/<name>/server).",
};
const importsApp = {
  group: ["@/app/*", "@/app"],
  message: "Routes are the top layer; nothing else may import from app/.",
};
const importsModules = {
  group: ["@/modules", "@/modules/*"],
  message: "This layer sits below modules/ and must not import from it.",
};
const importsDesignSystem = {
  group: ["@/design-system/*"],
  message: "lib/ is the bottom layer and must not import from design-system/.",
};

const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Next 16 adds this rule; the effects flagged here sync localStorage / URL state after hydration on purpose.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  { rules: restrict(deepModuleImport) },
  { files: ["modules/**"], rules: restrict(deepModuleImport, importsApp) },
  { files: ["design-system/**"], rules: restrict(deepModuleImport, importsApp, importsModules) },
  { files: ["lib/**"], rules: restrict(deepModuleImport, importsApp, importsModules, importsDesignSystem) },
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "admin/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
