# button-usage

For demo-shop page entry files under `apps/demo-shop/src/pages/**/index.tsx`:

- Replace a native `<button>` with the shared `Button` component from `packages/ui/Button`.
- In page files such as `apps/demo-shop/src/pages/button-lab/index.tsx`, import `Button` from `../../../../../packages/ui/Button`.
- Keep the edit page-local; do not modify `packages/ui/**`.
- The final file should render `<Button />` and should no longer contain a native `<button>`.
