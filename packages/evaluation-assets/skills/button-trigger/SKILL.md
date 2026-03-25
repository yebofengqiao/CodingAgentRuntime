---
name: button-trigger
description: Triggered button usage guidance when a task mentions button-lab, native button replacement, or the shared Button component.
triggers:
  - button-lab
  - native button
  - shared Button
  - packages/ui/Button
---

# button-trigger

If the task mentions `button-lab`, replacing a native `<button>`, or using the shared `Button` component:

- Edit `apps/demo-shop/src/pages/button-lab/index.tsx`.
- Add `import { Button } from '../../../../../packages/ui/Button';`.
- Replace `<button type="button">Buy now</button>` with `<Button />`.
- Do not change `packages/ui/**`.
- Re-run `node scripts/check-button-usage.js FE_BUTTON_01 apps/demo-shop/src/pages/button-lab/index.tsx` before finishing.
