# Button Usage Playbook

Use this playbook for `FE_BUTTON_01`.

1. Edit `apps/demo-shop/src/pages/button-lab/index.tsx`.
2. Add a named import:
   `import { Button } from '../../../../../packages/ui/Button';`
3. Replace the native `<button type="button">Buy now</button>` element with `<Button />`.
4. Keep the edit inside `apps/demo-shop/**` and `.evaluation/**`.
5. Do not modify `packages/ui/**`.
6. Run:
   `node scripts/check-button-usage.js FE_BUTTON_01 apps/demo-shop/src/pages/button-lab/index.tsx`
7. Then continue with the normal mock result validation flow for the case.
