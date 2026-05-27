import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "tsconfig.tsbuildinfo"],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Используем useEffect для синхронизации формы с подгруженными данными — допустимый паттерн.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
