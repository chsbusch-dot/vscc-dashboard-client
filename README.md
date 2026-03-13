# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Dependency Management

### SciChart.js Community License

This project uses the Community Edition of SciChart.js. It's important to be aware of its licensing terms:

-   **6-Month Expiration:** Each version of the SciChart.js Community Edition has a built-in 6-month expiration date. After this period, the charts will display a license error and will no longer function.
-   **Non-Commercial Use:** The community license is strictly for non-commercial, educational, or open-source projects.
-   **Watermark:** The charts will display a SciChart watermark.

To ensure the dashboard continues to function, you **must** update the SciChart.js dependency at least every 6 months.

### Updating SciChart.js

To update SciChart.js to the latest version, follow these steps:

1.  Navigate to the `vscc-dashboard-client` directory:
    ```bash
    cd vscc-dashboard-client
    ```
2.  Run the npm update command for scichart:
    ```bash
    npm update scichart
    ```
    Alternatively, you can install the absolute latest version:
    ```bash
    npm install scichart@latest
    ```
3.  Install the updated packages:
    ```bash
    npm install
    ```
4.  After updating, it's a good idea to run the development server to ensure everything is working correctly:
    ```bash
    npm run dev
    ```

### Backend Dependencies (EMQX, TimescaleDB)

The backend services running in Docker (like EMQX and TimescaleDB) can be updated by running the `update.sh` script in the `vscc-mqtt-server` directory:

```bash
cd ../vscc-mqtt-server
sudo ./update.sh
```
