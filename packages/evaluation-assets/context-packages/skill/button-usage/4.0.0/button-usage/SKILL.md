---
name: button-usage
description: Strong keyword-triggered guidance for replacing the button-lab native button with the shared Button export.
triggers:
  - button-lab
  - native button
  - shared Button
  - packages/ui/Button
---

# button-usage

Use this skill only for demo-shop page entry files such as `apps/demo-shop/src/pages/button-lab/index.tsx`.

Required steps:

1. Open `packages/ui/Button.tsx` first and copy the real export shape from that file.
2. Edit the existing page file in place. Do not recreate the whole page with a new component structure unless the file is missing.
3. Replace the native `<button>` with `<Button />`.
4. Re-run the validation commands before finishing. If either command fails, fix the file and run them again.

Hard requirements:

- `packages/ui/Button.tsx` currently exports `Button` as a named export, so the page import must be:
  `import { Button } from '../../../../../packages/ui/Button';`
- Do not use a default import such as `import Button from ...`; `check-button-usage.js` will fail.
- The final file must still contain `<Button` and must not contain any native `<button`.
- Keep all edits inside `apps/demo-shop/**` and `.evaluation/**`. Never modify `packages/ui/**`.

Target shape for `apps/demo-shop/src/pages/button-lab/index.tsx`:

```tsx
import { Button } from '../../../../../packages/ui/Button';

export const ButtonLabPage = () => (
  <div>
    <Button />
  </div>
);
```

Validation commands:

```bash
node scripts/check-button-usage.js FE_BUTTON_01 apps/demo-shop/src/pages/button-lab/index.tsx
node scripts/check-mock-result.js FE_BUTTON_01
```

Result payload reminder:

- Write `.evaluation/mock-result.json`.
- It must contain `case_id: "FE_BUTTON_01"` and a non-empty `variant_id`.
