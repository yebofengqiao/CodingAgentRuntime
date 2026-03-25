from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from app.conversation.domain.models import Conversation, ConversationEvent
from app.eval.application.services import EvalAppService
from app.eval.domain.models import EvalExperiment, ExperimentCreate


class EvalAppServiceTests(unittest.TestCase):
    def _make_engine(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        self.addCleanup(engine.dispose)
        return engine

    def _create_conversation(self, session: Session) -> Conversation:
        conversation = Conversation()
        session.add(conversation)
        session.flush()
        return conversation

    def _add_event(
        self,
        session: Session,
        *,
        conversation_id,
        seq: int,
        kind: str,
        source: str,
        payload: dict,
        timestamp: datetime,
    ) -> None:
        session.add(
            ConversationEvent(
                conversation_id=conversation_id,
                seq=seq,
                event_id=f"{conversation_id}-{seq}",
                kind=kind,
                source=source,
                payload=payload,
                timestamp=timestamp,
            )
        )

    def test_create_experiment_generates_case_results_and_real_winner(self) -> None:
        engine = self._make_engine()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace_root = root / "workspaces"
            sandbox_root = root / "sandboxes"
            service = EvalAppService(
                engine,
                workspace_root=workspace_root,
                sandbox_root=sandbox_root,
            )

            with Session(engine) as session:
                base_time = datetime(2026, 3, 6, 10, 0, 0)

                baseline_case_a = self._create_conversation(session)
                baseline_case_b = self._create_conversation(session)
                variant_case_a = self._create_conversation(session)
                variant_case_b = self._create_conversation(session)

                (workspace_root / str(baseline_case_a.id)).mkdir(parents=True, exist_ok=True)
                (workspace_root / str(baseline_case_a.id) / "artifact.txt").write_text(
                    "baseline-a",
                    encoding="utf-8",
                )
                (workspace_root / str(variant_case_a.id)).mkdir(parents=True, exist_ok=True)
                (workspace_root / str(variant_case_a.id) / "artifact.txt").write_text(
                    "variant-a",
                    encoding="utf-8",
                )

                self._add_event(
                    session,
                    conversation_id=baseline_case_a.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "run task a"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case_a.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case_a.id,
                    seq=3,
                    kind="observation",
                    source="environment",
                    payload={
                        "action_id": f"{baseline_case_a.id}-2",
                        "tool_name": "terminal",
                        "result": "command succeeded",
                    },
                    timestamp=base_time + timedelta(seconds=2),
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case_a.id,
                    seq=4,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "success baseline done"},
                    timestamp=base_time + timedelta(seconds=3),
                )

                self._add_event(
                    session,
                    conversation_id=baseline_case_b.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "run task b"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case_b.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "high",
                        "requires_confirmation": True,
                        "executable": False,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )

                self._add_event(
                    session,
                    conversation_id=variant_case_a.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "run task a"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=variant_case_a.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=variant_case_a.id,
                    seq=3,
                    kind="observation",
                    source="environment",
                    payload={
                        "action_id": f"{variant_case_a.id}-2",
                        "tool_name": "terminal",
                        "result": "command succeeded",
                    },
                    timestamp=base_time + timedelta(seconds=2),
                )
                self._add_event(
                    session,
                    conversation_id=variant_case_a.id,
                    seq=4,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "success variant done"},
                    timestamp=base_time + timedelta(seconds=3),
                )

                self._add_event(
                    session,
                    conversation_id=variant_case_b.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "run task b"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=variant_case_b.id,
                    seq=2,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "done variant result"},
                    timestamp=base_time + timedelta(seconds=2),
                )

                session.commit()

                request = ExperimentCreate.model_validate(
                    {
                        "dataset": {
                            "name": "smoke-dataset",
                            "cases": [
                                {
                                    "case_id": "task-a",
                                    "prompt": "run task a",
                                    "code_state_ref": "refs/heads/frontend-task-a",
                                    "requirement_bundle": {
                                        "primary_requirement_doc": {
                                            "title": "task a spec",
                                            "path": "docs/task-a.md",
                                        },
                                        "acceptance_criteria": ["mention success"],
                                    },
                                    "task_family": "page_component_modification",
                                    "difficulty": "simple",
                                    "tuning_axis": "prompt",
                                    "completion_checks": [
                                        {
                                            "check_id": "task-a-rubric",
                                            "kind": "rubric",
                                            "label": "mentions success",
                                            "success_indicators": ["success"],
                                        }
                                    ],
                                    "expected_artifacts": ["artifact.txt"],
                                    "expected_keywords": ["success"],
                                    "expected_tools": ["terminal"],
                                },
                                {
                                    "case_id": "task-b",
                                    "prompt": "run task b",
                                    "code_state_ref": "refs/heads/frontend-task-b",
                                    "requirement_bundle": {
                                        "primary_requirement_doc": {
                                            "title": "task b spec",
                                            "path": "docs/task-b.md",
                                        },
                                        "acceptance_criteria": ["say done"],
                                    },
                                    "task_family": "api_data_contract_adaptation",
                                    "difficulty": "medium",
                                    "tuning_axis": "skills",
                                    "expected_keywords": ["done"],
                                },
                            ],
                        },
                        "baseline_strategy": {
                            "name": "baseline-prompt",
                            "prompt_version": "v1",
                            "enabled_skills": ["repo-guidelines"],
                            "mcp_profile": "none",
                            "sandbox_profile": "workspace-exec",
                            "case_bindings": [
                                {
                                    "case_id": "task-a",
                                    "conversation_id": str(baseline_case_a.id),
                                },
                                {
                                    "case_id": "task-b",
                                    "conversation_id": str(baseline_case_b.id),
                                },
                            ],
                        },
                        "variant_strategy": {
                            "name": "variant-with-prompt",
                            "prompt_version": "v2",
                            "enabled_skills": ["repo-guidelines"],
                            "sandbox_profile": "workspace-exec",
                            "case_bindings": [
                                {
                                    "case_id": "task-a",
                                    "conversation_id": str(variant_case_a.id),
                                },
                                {
                                    "case_id": "task-b",
                                    "conversation_id": str(variant_case_b.id),
                                },
                            ],
                        },
                    }
                )

            created = service.create_experiment(request)
            result = service.get_experiment(created.experiment_id)

            self.assertEqual(result.case_count, 2)
            self.assertEqual(result.winner, "variant")
            self.assertEqual(result.baseline_metrics.success_rate, 0.5)
            self.assertEqual(result.variant_metrics.success_rate, 1.0)
            self.assertEqual(
                result.baseline_failure_buckets,
                {"approval_blocked": 1},
            )
            self.assertEqual(result.variant_failure_buckets, {})
            self.assertEqual(result.baseline_gap_buckets, {"approval_gap": 1})
            self.assertEqual(result.variant_gap_buckets, {})
            self.assertEqual(result.baseline_cases[1].failure_bucket, "approval_blocked")
            self.assertEqual(result.baseline_cases[1].suspected_gap, "approval_gap")
            self.assertEqual(result.baseline_cases[0].completion_status, "passed")
            self.assertEqual(result.baseline_cases[0].automated_check_results[0].kind, "artifact")
            self.assertEqual(result.baseline_cases[0].rubric_score, 1.0)
            self.assertEqual(
                result.pass_rate_by_family["baseline"]["api_data_contract_adaptation"],
                0.0,
            )
            self.assertEqual(
                result.pass_rate_by_axis["variant"]["prompt"],
                1.0,
            )
            self.assertIn("prompt profile", result.tuning_recommendations[0])
            self.assertTrue(Path(result.baseline_cases[0].sandbox.sandbox_path).exists())
            self.assertEqual(
                result.baseline_cases[0].sandbox.workspace_entries,
                ["artifact.txt"],
            )

    def test_repeat_experiment_keeps_results_stable_and_sandbox_isolated(self) -> None:
        engine = self._make_engine()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace_root = root / "workspaces"
            sandbox_root = root / "sandboxes"
            service = EvalAppService(
                engine,
                workspace_root=workspace_root,
                sandbox_root=sandbox_root,
            )

            with Session(engine) as session:
                base_time = datetime(2026, 3, 6, 11, 0, 0)
                baseline_case = self._create_conversation(session)
                variant_case = self._create_conversation(session)

                for conversation in (baseline_case, variant_case):
                    (workspace_root / str(conversation.id)).mkdir(parents=True, exist_ok=True)

                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "write report"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "file_editor",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=3,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "report done"},
                    timestamp=base_time + timedelta(seconds=2),
                )

                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "write report"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=3,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "report done"},
                    timestamp=base_time + timedelta(seconds=2),
                )
                session.commit()

                request = ExperimentCreate.model_validate(
                    {
                        "dataset": {
                            "name": "sandbox-dataset",
                            "cases": [
                                {
                                    "case_id": "write-report",
                                    "prompt": "write report",
                                    "code_state_ref": "refs/heads/frontend-report",
                                    "requirement_bundle": {
                                        "primary_requirement_doc": {
                                            "title": "report task",
                                            "path": "docs/report.md",
                                        },
                                        "acceptance_criteria": ["include report"],
                                    },
                                    "task_family": "workspace_artifact_docs_release_sync",
                                    "difficulty": "simple",
                                    "tuning_axis": "model",
                                    "expected_keywords": ["report"],
                                }
                            ],
                        },
                        "baseline_strategy": {
                            "name": "workspace-write-ok",
                            "prompt_version": "v1",
                            "enabled_skills": [],
                            "model_profile": {"model": "gpt-5.4"},
                            "mcp_profile": "none",
                            "sandbox_profile": "workspace-write",
                            "case_bindings": [
                                {
                                    "case_id": "write-report",
                                    "conversation_id": str(baseline_case.id),
                                }
                            ],
                        },
                        "variant_strategy": {
                            "name": "workspace-write-violated",
                            "prompt_version": "v1",
                            "enabled_skills": [],
                            "model_profile": {"model": "gpt-5.4-mini"},
                            "mcp_profile": "none",
                            "sandbox_profile": "workspace-write",
                            "case_bindings": [
                                {
                                    "case_id": "write-report",
                                    "conversation_id": str(variant_case.id),
                                }
                            ],
                        },
                    }
                )

            first_created = service.create_experiment(request)
            first_result = service.get_experiment(first_created.experiment_id)

            first_sandbox_path = Path(first_result.baseline_cases[0].sandbox.sandbox_path)
            (first_sandbox_path / "pollution.txt").write_text("dirty", encoding="utf-8")

            second_created = service.create_experiment(request)
            second_result = service.get_experiment(second_created.experiment_id)
            second_sandbox_path = Path(second_result.baseline_cases[0].sandbox.sandbox_path)

            self.assertNotEqual(first_created.experiment_id, second_created.experiment_id)
            self.assertNotEqual(first_sandbox_path, second_sandbox_path)
            self.assertFalse((second_sandbox_path / "pollution.txt").exists())
            self.assertEqual(first_result.baseline_metrics, second_result.baseline_metrics)
            self.assertEqual(first_result.variant_metrics, second_result.variant_metrics)
            self.assertEqual(
                second_result.variant_failure_buckets,
                {"sandbox_violation": 1},
            )
            self.assertEqual(
                second_result.variant_gap_buckets,
                {"workspace_gap": 1},
            )
            self.assertEqual(
                second_result.variant_cases[0].sandbox_violation_tools,
                ["terminal"],
            )
            self.assertEqual(
                second_result.baseline_cases[0].sandbox.tool_allowlist,
                ["file_editor", "task_tracker"],
            )

    def test_get_experiment_keeps_legacy_payloads_readable(self) -> None:
        engine = self._make_engine()
        service = EvalAppService(engine)
        experiment_id = uuid4()

        with Session(engine) as session:
            session.add(
                EvalExperiment(
                    id=experiment_id,
                    status="finished",
                    request_payload={},
                    result_payload={
                        "baseline_name": "baseline",
                        "variant_name": "variant",
                        "conversation_count": 3,
                        "baseline_metrics": {
                            "success_rate": 0.5,
                            "avg_steps": 2.0,
                            "avg_latency_ms": 1200.0,
                            "avg_cost": 0.02,
                        },
                        "variant_metrics": {
                            "success_rate": 0.75,
                            "avg_steps": 1.0,
                            "avg_latency_ms": 900.0,
                            "avg_cost": 0.01,
                        },
                        "winner": "variant",
                        "notes": "legacy payload",
                    },
                )
            )
            session.commit()

        result = service.get_experiment(experiment_id)

        self.assertIsNone(result.dataset)
        self.assertEqual(result.case_count, 3)
        self.assertEqual(result.baseline_strategy.name, "baseline")
        self.assertEqual(result.variant_strategy.name, "variant")
        self.assertEqual(result.baseline_cases, [])
        self.assertEqual(result.variant_cases, [])
        self.assertEqual(result.baseline_gap_buckets, {})
        self.assertEqual(result.variant_gap_buckets, {})
        self.assertEqual(result.pass_rate_by_family, {})
        self.assertEqual(result.pass_rate_by_axis, {})
        self.assertEqual(result.tuning_recommendations, [])

    def test_list_experiments_returns_latest_first_with_derived_summary(self) -> None:
        engine = self._make_engine()
        service = EvalAppService(engine)
        older_id = uuid4()
        newer_id = uuid4()

        with Session(engine) as session:
            session.add(
                EvalExperiment(
                    id=older_id,
                    status="finished",
                    request_payload={
                        "baseline_strategy": {
                            "name": "baseline-v1",
                            "prompt_version": "v1",
                            "enabled_skills": ["repo-guidelines"],
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-v2",
                            "prompt_version": "v2",
                            "enabled_skills": ["repo-guidelines"],
                            "case_bindings": [],
                        },
                    },
                    result_payload={
                        "dataset": {
                            "name": "prompt-dataset",
                            "cases": [
                                {
                                    "case_id": "task-a",
                                    "prompt": "run task a",
                                }
                            ],
                        },
                        "case_count": 1,
                        "baseline_name": "baseline-v1",
                        "variant_name": "variant-v2",
                        "baseline_strategy": {
                            "name": "baseline-v1",
                            "prompt_version": "v1",
                            "enabled_skills": ["repo-guidelines"],
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-v2",
                            "prompt_version": "v2",
                            "enabled_skills": ["repo-guidelines"],
                            "case_bindings": [],
                        },
                        "baseline_metrics": {
                            "success_rate": 0.25,
                            "avg_steps": 5.0,
                            "avg_latency_ms": 1200.0,
                            "avg_cost": 0.11,
                        },
                        "variant_metrics": {
                            "success_rate": 0.75,
                            "avg_steps": 4.0,
                            "avg_latency_ms": 1100.0,
                            "avg_cost": 0.1,
                        },
                        "winner": "variant",
                    },
                    created_at=datetime(2026, 3, 5, 9, 0, 0),
                    updated_at=datetime(2026, 3, 5, 9, 30, 0),
                )
            )
            session.add(
                EvalExperiment(
                    id=newer_id,
                    status="finished",
                    request_payload={
                        "baseline_strategy": {
                            "name": "baseline-context",
                            "business_context_profile": "frontend-domain-v1",
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-context",
                            "business_context_profile": "frontend-domain-v2",
                            "case_bindings": [],
                        },
                    },
                    result_payload={
                        "dataset": {
                            "name": "context-dataset",
                            "cases": [
                                {
                                    "case_id": "task-a",
                                    "prompt": "run task a",
                                },
                                {
                                    "case_id": "task-b",
                                    "prompt": "run task b",
                                },
                            ],
                        },
                        "baseline_name": "baseline-context",
                        "variant_name": "variant-context",
                        "baseline_strategy": {
                            "name": "baseline-context",
                            "business_context_profile": "frontend-domain-v1",
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-context",
                            "business_context_profile": "frontend-domain-v2",
                            "case_bindings": [],
                        },
                        "baseline_metrics": {
                            "success_rate": 0.5,
                            "avg_steps": 6.0,
                            "avg_latency_ms": 2000.0,
                            "avg_cost": 0.2,
                        },
                        "variant_metrics": {
                            "success_rate": 1.0,
                            "avg_steps": 4.0,
                            "avg_latency_ms": 1600.0,
                            "avg_cost": 0.18,
                        },
                        "winner": "variant",
                    },
                    created_at=datetime(2026, 3, 6, 9, 0, 0),
                    updated_at=datetime(2026, 3, 6, 9, 45, 0),
                )
            )
            session.commit()

        summaries = service.list_experiments(limit=10)

        self.assertEqual([summary.experiment_id for summary in summaries], [newer_id, older_id])
        self.assertEqual(summaries[0].dataset_name, "context-dataset")
        self.assertEqual(summaries[0].case_count, 2)
        self.assertEqual(summaries[0].changed_tuning_field, "business_context_profile")
        self.assertEqual(summaries[0].baseline_success_rate, 0.5)
        self.assertEqual(summaries[0].variant_success_rate, 1.0)
        self.assertEqual(summaries[1].changed_tuning_field, "prompt_version")

    def test_list_experiments_keeps_legacy_rows_visible(self) -> None:
        engine = self._make_engine()
        service = EvalAppService(engine)
        experiment_id = uuid4()

        with Session(engine) as session:
            session.add(
                EvalExperiment(
                    id=experiment_id,
                    status="finished",
                    request_payload={},
                    result_payload={
                        "baseline_name": "baseline",
                        "variant_name": "variant",
                        "conversation_count": 3,
                        "winner": "tie",
                    },
                    created_at=datetime(2026, 3, 7, 9, 0, 0),
                    updated_at=datetime(2026, 3, 7, 9, 0, 0),
                )
            )
            session.commit()

        summaries = service.list_experiments(limit=10)

        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0].experiment_id, experiment_id)
        self.assertEqual(summaries[0].dataset_name, "legacy-dataset")
        self.assertEqual(summaries[0].case_count, 3)
        self.assertEqual(summaries[0].changed_tuning_field, "unknown")
        self.assertEqual(summaries[0].baseline_success_rate, 0.0)
        self.assertEqual(summaries[0].variant_success_rate, 0.0)

    def test_create_experiment_rejects_multi_axis_strategy_delta(self) -> None:
        with self.assertRaisesRegex(
            ValueError,
            "must differ in exactly one tuning field",
        ):
            ExperimentCreate.model_validate(
                {
                    "dataset": {
                        "name": "invalid-dataset",
                        "cases": [
                            {
                                "case_id": "task-a",
                                "prompt": "run task a",
                            }
                        ],
                    },
                    "baseline_strategy": {
                        "name": "baseline",
                        "prompt_version": "v1",
                        "enabled_skills": [],
                        "case_bindings": [
                            {
                                "case_id": "task-a",
                                "conversation_id": str(uuid4()),
                            }
                        ],
                    },
                    "variant_strategy": {
                        "name": "variant",
                        "prompt_version": "v2",
                        "enabled_skills": ["repo-guidelines"],
                        "case_bindings": [
                            {
                                "case_id": "task-a",
                                "conversation_id": str(uuid4()),
                            }
                        ],
                    },
                }
            )

    def test_context_profile_comparison_uses_hybrid_completion_and_context_gap(self) -> None:
        engine = self._make_engine()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace_root = root / "workspaces"
            sandbox_root = root / "sandboxes"
            service = EvalAppService(
                engine,
                workspace_root=workspace_root,
                sandbox_root=sandbox_root,
            )

            with Session(engine) as session:
                base_time = datetime(2026, 3, 6, 12, 0, 0)
                baseline_case = self._create_conversation(session)
                variant_case = self._create_conversation(session)

                (workspace_root / str(baseline_case.id)).mkdir(parents=True, exist_ok=True)
                (workspace_root / str(baseline_case.id) / "release-note.md").write_text(
                    "ok",
                    encoding="utf-8",
                )
                (workspace_root / str(variant_case.id)).mkdir(parents=True, exist_ok=True)

                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "apply frontend change"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=3,
                    kind="observation",
                    source="environment",
                    payload={
                        "action_id": f"{baseline_case.id}-2",
                        "tool_name": "terminal",
                        "result": "build succeeded",
                    },
                    timestamp=base_time + timedelta(seconds=2),
                )
                self._add_event(
                    session,
                    conversation_id=baseline_case.id,
                    seq=4,
                    kind="message",
                    source="agent",
                    payload={
                        "role": "assistant",
                        "text": "accepted change and wrote release-note.md",
                    },
                    timestamp=base_time + timedelta(seconds=3),
                )

                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=1,
                    kind="message",
                    source="user",
                    payload={"role": "user", "text": "apply frontend change"},
                    timestamp=base_time,
                )
                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=2,
                    kind="action",
                    source="agent",
                    payload={
                        "tool_name": "terminal",
                        "security_risk": "low",
                        "requires_confirmation": False,
                        "executable": True,
                    },
                    timestamp=base_time + timedelta(seconds=1),
                )
                self._add_event(
                    session,
                    conversation_id=variant_case.id,
                    seq=3,
                    kind="message",
                    source="agent",
                    payload={"role": "assistant", "text": "change applied"},
                    timestamp=base_time + timedelta(seconds=2),
                )
                session.commit()

                request = ExperimentCreate.model_validate(
                    {
                        "dataset": {
                            "name": "context-dataset",
                            "cases": [
                                {
                                    "case_id": "frontend-context-case",
                                    "prompt": "apply frontend change",
                                    "code_state_ref": "refs/heads/frontend-context",
                                    "requirement_bundle": {
                                        "primary_requirement_doc": {
                                            "title": "frontend change",
                                            "path": "docs/frontend-change.md",
                                        },
                                        "acceptance_criteria": [
                                            "run the build",
                                            "write the release note",
                                        ],
                                        "api_contracts": [
                                            {
                                                "title": "contract",
                                                "path": "docs/api.json",
                                                "doc_type": "api",
                                            }
                                        ],
                                    },
                                    "task_family": "page_component_modification",
                                    "difficulty": "complex",
                                    "tuning_axis": "context",
                                    "context_mode": "business",
                                    "completion_checks": [
                                        {
                                            "check_id": "build-ok",
                                            "kind": "build",
                                            "label": "frontend build passes",
                                            "success_indicators": ["build succeeded"],
                                        },
                                        {
                                            "check_id": "acceptance-rubric",
                                            "kind": "rubric",
                                            "label": "mentions accepted change",
                                            "success_indicators": ["accepted change"],
                                        },
                                    ],
                                    "expected_artifacts": ["release-note.md"],
                                }
                            ],
                        },
                        "baseline_strategy": {
                            "name": "context-v1",
                            "prompt_version": "v1",
                            "business_context_profile": "frontend-domain-v1",
                            "case_bindings": [
                                {
                                    "case_id": "frontend-context-case",
                                    "conversation_id": str(baseline_case.id),
                                }
                            ],
                        },
                        "variant_strategy": {
                            "name": "context-v2",
                            "prompt_version": "v1",
                            "business_context_profile": "frontend-domain-v2",
                            "case_bindings": [
                                {
                                    "case_id": "frontend-context-case",
                                    "conversation_id": str(variant_case.id),
                                }
                            ],
                        },
                    }
                )

            created = service.create_experiment(request)
            result = service.get_experiment(created.experiment_id)

            self.assertEqual(result.winner, "baseline")
            self.assertEqual(result.baseline_metrics.success_rate, 1.0)
            self.assertEqual(result.variant_metrics.success_rate, 0.0)
            self.assertEqual(result.variant_failure_buckets, {"output_mismatch": 1})
            self.assertEqual(result.variant_gap_buckets, {"context_gap": 1})
            self.assertEqual(
                result.variant_cases[0].completion_status,
                "failed",
            )
            self.assertEqual(
                [check.kind for check in result.baseline_cases[0].automated_check_results],
                ["build", "artifact"],
            )
            self.assertEqual(result.baseline_cases[0].rubric_score, 1.0)
            self.assertEqual(result.variant_cases[0].suspected_gap, "context_gap")
            self.assertIn(
                "business_context_profile",
                result.variant_cases[0].recommended_action,
            )
            self.assertIn("business context profile", result.tuning_recommendations[0])


if __name__ == "__main__":
    unittest.main()
