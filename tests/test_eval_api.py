from __future__ import annotations

import unittest
from datetime import datetime
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from app.eval.domain.models import EvalExperiment
from app.eval.interfaces import api as eval_api
from app.eval.application.services import EvalAppService


class EvalApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)

        self.service = EvalAppService(self.engine)
        self.original_service = eval_api._service
        eval_api._service = self.service
        self.addCleanup(self._restore_api_globals)

        app = FastAPI()
        app.include_router(eval_api.eval_router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _restore_api_globals(self) -> None:
        eval_api._service = self.original_service

    def test_list_experiments_returns_latest_summaries(self) -> None:
        older_id = uuid4()
        newer_id = uuid4()

        with Session(self.engine) as session:
            session.add(
                EvalExperiment(
                    id=older_id,
                    status="finished",
                    request_payload={
                        "baseline_strategy": {
                            "name": "baseline-v1",
                            "prompt_version": "v1",
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-v2",
                            "prompt_version": "v2",
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
                        "baseline_name": "baseline-v1",
                        "variant_name": "variant-v2",
                        "baseline_strategy": {
                            "name": "baseline-v1",
                            "prompt_version": "v1",
                            "case_bindings": [],
                        },
                        "variant_strategy": {
                            "name": "variant-v2",
                            "prompt_version": "v2",
                            "case_bindings": [],
                        },
                        "baseline_metrics": {
                            "success_rate": 0.25,
                            "avg_steps": 5.0,
                            "avg_latency_ms": 1000.0,
                            "avg_cost": 0.1,
                        },
                        "variant_metrics": {
                            "success_rate": 0.75,
                            "avg_steps": 4.0,
                            "avg_latency_ms": 900.0,
                            "avg_cost": 0.08,
                        },
                        "winner": "variant",
                    },
                    created_at=datetime(2026, 3, 8, 8, 0, 0),
                    updated_at=datetime(2026, 3, 8, 8, 0, 0),
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
                                    "case_id": "task-b",
                                    "prompt": "run task b",
                                }
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
                            "avg_latency_ms": 1600.0,
                            "avg_cost": 0.12,
                        },
                        "variant_metrics": {
                            "success_rate": 1.0,
                            "avg_steps": 4.0,
                            "avg_latency_ms": 1400.0,
                            "avg_cost": 0.11,
                        },
                        "winner": "variant",
                    },
                    created_at=datetime(2026, 3, 9, 8, 0, 0),
                    updated_at=datetime(2026, 3, 9, 8, 0, 0),
                )
            )
            session.commit()

        response = self.client.get("/eval/experiments?limit=10")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["experiment_id"] for row in payload], [str(newer_id), str(older_id)])
        self.assertEqual(payload[0]["dataset_name"], "context-dataset")
        self.assertEqual(payload[0]["changed_tuning_field"], "business_context_profile")
        self.assertEqual(payload[1]["changed_tuning_field"], "prompt_version")


if __name__ == "__main__":
    unittest.main()
