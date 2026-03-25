# AGENTS.md

## Project Context

- This repository is positioned as an `Evaluation-Driven Coding Agent Runtime`, not a training-centric optimization project.
- The default product audience is a business frontend team using fixed benchmark cases to tune `context / skills / prompt / model` against real coding tasks.
- The current product pillars are `runtime execution`, `sandbox/workspace`, `benchmark evaluation`, and `context engineering`.
- Eval cases are grounded in `code_state_ref + requirement_bundle`, and strategy comparison should stay single-variable unless a document explicitly says otherwise.
- Only claim shipped capabilities when they exist in code or tests. Treat context engineering as active design and roadmap work unless a document explicitly marks something implemented.
- Use `README.md` and the public showcase docs under `docs/showcase/` for product context, narrative, and demo flow.

## Frontend Guidelines

- 前端开发默认使用 React。
- 状态管理优先使用 MobX。
- UI 组件优先使用 Ant Design 和 `@chatui/core`。
- 能复用现成组件时，不要重复造组件。
- 能复用现成样式体系时，不要手写大段 CSS；只有在现有组件库确实无法满足需求时，才补充最小必要的自定义样式。
- 新增前端页面、聊天界面、表单、列表、弹窗、消息流等内容时，优先沿用上述技术栈和组件体系，保持风格统一。
