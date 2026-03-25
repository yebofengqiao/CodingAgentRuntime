# FE_BUTTON_01 Case Prompt Additions

This business fine-tuning case keeps the platform prompt fixed and adds only this
case-specific guidance on top of the default developer prompt.

- Open `packages/ui/Button.tsx` before editing the page and follow the export shape that already exists there.
- Replace the native `<button>` in `apps/demo-shop/src/pages/button-lab/index.tsx` with the shared Button component instead of recreating button behavior locally.
- Keep the change inside `apps/demo-shop/**` and `.evaluation/**`; never edit `packages/ui/**`.
- Validation checks the real import form and component usage, so match the shared component contract exactly instead of guessing.
