# Evaluation Assets

This package is the active asset root for the TS evaluation system.

The public showcase keeps the core button-demo assets and the minimal comparison scaffolding for platform and business optimization:

- `cases/frontend/skills/fe_button_01.yaml`
- `requirements/demo-shop/fe_button_01.md`
- `prompts/cases/frontend/fe_button_01.md`
- `context/demo-shop/repo_map.md`
- `repos/demo-shop`
- `context-packages/repo-policy/frontend-base/1.0.0`
- `context-packages/skill/button-usage/{1.0.0,2.0.0,3.0.0,4.0.0}`
- `variants/strategy/{baseline-v1,prompt-v2,model-v2,business-context-v2,session-context-v2,button-trigger-v1,button-progressive-v1}.yaml`
- `variants/business-fine-tuning/{ft-baseline-v1,ft-button-skill-baseline-v1,ft-button-skill-v2,ft-button-skill-v3,ft-button-skill-v4}.yaml`
- `demo/button-skill-public-demo.payload.json`

Notes:

- `packages/backend-core` loads this directory by default via `EVALUATION_ASSETS_ROOT`.
- Add new assets here only when they are part of the public evaluation story.
