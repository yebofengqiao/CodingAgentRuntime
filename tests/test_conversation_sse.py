from __future__ import annotations

import asyncio
import json
import unittest
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine
from starlette.requests import Request

from app.conversation.application.services import ConversationAppService
from app.conversation.infrastructure.repositories import ConversationRepository
from app.conversation.interfaces import api as conversation_api
from app.conversation.runtime.conversation_manager import ConversationRuntimeManager


class ConversationSseApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)

        self.runtime_manager = ConversationRuntimeManager(engine=self.engine)
        self.service = ConversationAppService(
            engine=self.engine,
            runtime_manager=self.runtime_manager,
        )

        self.original_service = conversation_api._service
        self.original_runtime_manager = conversation_api._runtime_manager
        conversation_api._service = self.service
        conversation_api._runtime_manager = self.runtime_manager
        self.addCleanup(self._restore_api_globals)

        app = FastAPI()
        app.include_router(conversation_api.conversation_router)
        app.include_router(conversation_api.conversation_ws_router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _restore_api_globals(self) -> None:
        conversation_api._service = self.original_service
        conversation_api._runtime_manager = self.original_runtime_manager

    def _create_conversation(self) -> UUID:
        response = self.client.post("/conversations")
        self.assertEqual(response.status_code, 201)
        return UUID(response.json()["conversation_id"])

    def _append_event(
        self,
        conversation_id: UUID,
        *,
        event_id: str,
        kind: str,
        source: str,
        payload: dict[str, object],
        timestamp: datetime,
    ) -> None:
        with Session(self.engine) as session:
            repository = ConversationRepository(session)
            repository.append_event(
                conversation_id,
                event_id=event_id,
                kind=kind,
                source=source,
                payload=payload,
                timestamp=timestamp,
            )
            session.commit()

    def _set_conversation_status(self, conversation_id: UUID, status: str) -> None:
        with Session(self.engine) as session:
            repository = ConversationRepository(session)
            repository.set_conversation_execution_status(
                conversation_id,
                execution_status=status,
            )
            session.commit()

    def _create_run(
        self,
        conversation_id: UUID,
        *,
        status: str,
        waiting_action_id: str | None = None,
    ) -> str:
        with Session(self.engine) as session:
            repository = ConversationRepository(session)
            run = repository.create_run(conversation_id)
            repository.set_run_status(
                run.id,
                status=status,
                waiting_action_id=waiting_action_id,
                error_detail=None,
            )
            session.commit()
            return str(run.id)

    def _make_request(self, headers: dict[str, str] | None = None) -> Request:
        encoded_headers = [
            (key.lower().encode("utf-8"), value.encode("utf-8"))
            for key, value in (headers or {}).items()
        ]

        async def receive() -> dict[str, object]:
            return {"type": "http.request", "body": b"", "more_body": False}

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": encoded_headers,
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
        return Request(scope, receive)

    def _decode_sse_chunk(self, chunk: str | bytes) -> dict[str, object]:
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8")

        event_id: str | None = None
        data_lines: list[str] = []
        for line in chunk.splitlines():
            if not line or line.startswith(":"):
                continue

            field, _, value = line.partition(":")
            value = value.lstrip()
            if field == "id":
                event_id = value
            elif field == "data":
                data_lines.append(value)

        return {
            "id": event_id,
            "packet": json.loads("\n".join(data_lines)),
        }

    async def _open_stream(
        self,
        conversation_id: UUID,
        *,
        after_seq: int = 0,
        headers: dict[str, str] | None = None,
    ):
        request = self._make_request(headers)
        return await conversation_api.stream_conversation_events(
            request,
            conversation_id,
            after_seq=after_seq,
        )

    def test_unknown_conversation_stream_returns_404(self) -> None:
        response = self.client.get(f"/conversations/{uuid4()}/events/stream")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Conversation not found"})

    def test_stream_bootstrap_replays_history_then_status_then_runs(self) -> None:
        conversation_id = self._create_conversation()
        self._append_event(
            conversation_id,
            event_id="evt-1",
            kind="message",
            source="user",
            payload={"text": "hello"},
            timestamp=datetime(2026, 3, 10, 10, 0, 0),
        )
        self._set_conversation_status(conversation_id, "running")
        run_id = self._create_run(conversation_id, status="running")

        async def scenario() -> tuple[dict[str, object], dict[str, object], dict[str, object], int]:
            response = await self._open_stream(conversation_id)
            iterator = response.body_iterator
            try:
                first = self._decode_sse_chunk(await asyncio.wait_for(anext(iterator), timeout=1))
                second = self._decode_sse_chunk(await asyncio.wait_for(anext(iterator), timeout=1))
                third = self._decode_sse_chunk(await asyncio.wait_for(anext(iterator), timeout=1))
                return first, second, third, response.status_code
            finally:
                await iterator.aclose()

        first, second, third, status_code = asyncio.run(scenario())

        self.assertEqual(status_code, 200)
        self.assertEqual(first["id"], "1")
        self.assertEqual(first["packet"]["type"], "event")
        self.assertEqual(first["packet"]["data"]["seq"], 1)
        self.assertEqual(second["packet"], {"type": "status", "data": {"execution_status": "running"}})
        self.assertEqual(third["packet"]["type"], "run")
        self.assertEqual(third["packet"]["data"]["run_id"], run_id)
        self.assertEqual(third["packet"]["data"]["status"], "running")

    def test_stream_emits_live_packets_after_bootstrap(self) -> None:
        conversation_id = self._create_conversation()
        live_packet = {
            "type": "event",
            "data": {
                "seq": 7,
                "event_id": "evt-live",
                "kind": "observation",
                "source": "environment",
                "payload": {"result": "command succeeded"},
                "timestamp": "2026-03-10T10:00:07",
            },
        }

        async def scenario() -> tuple[dict[str, object], dict[str, object], int]:
            response = await self._open_stream(conversation_id)
            iterator = response.body_iterator
            try:
                bootstrap_packet = self._decode_sse_chunk(
                    await asyncio.wait_for(anext(iterator), timeout=1)
                )
                await self.runtime_manager._hub.broadcast(conversation_id, live_packet)
                streamed_packet = self._decode_sse_chunk(
                    await asyncio.wait_for(anext(iterator), timeout=1)
                )
                return bootstrap_packet, streamed_packet, response.status_code
            finally:
                await iterator.aclose()

        bootstrap_packet, streamed_packet, status_code = asyncio.run(scenario())

        self.assertEqual(status_code, 200)
        self.assertEqual(streamed_packet["id"], "7")
        self.assertEqual(
            bootstrap_packet["packet"],
            {"type": "status", "data": {"execution_status": "idle"}},
        )
        self.assertEqual(streamed_packet["packet"], live_packet)

    def test_stream_resume_skips_events_already_delivered(self) -> None:
        conversation_id = self._create_conversation()
        self._append_event(
            conversation_id,
            event_id="evt-1",
            kind="message",
            source="user",
            payload={"text": "first"},
            timestamp=datetime(2026, 3, 10, 10, 0, 0),
        )
        self._append_event(
            conversation_id,
            event_id="evt-2",
            kind="message",
            source="assistant",
            payload={"text": "second"},
            timestamp=datetime(2026, 3, 10, 10, 0, 1),
        )

        scenarios = [
            ("query", 1, {}),
            (
                "last-event-id",
                0,
                {"Last-Event-ID": "1"},
            ),
        ]

        for label, after_seq, headers in scenarios:
            with self.subTest(label=label):
                async def scenario() -> tuple[dict[str, object], dict[str, object], int]:
                    response = await self._open_stream(
                        conversation_id,
                        after_seq=after_seq,
                        headers=headers,
                    )
                    iterator = response.body_iterator
                    try:
                        first = self._decode_sse_chunk(
                            await asyncio.wait_for(anext(iterator), timeout=1)
                        )
                        second = self._decode_sse_chunk(
                            await asyncio.wait_for(anext(iterator), timeout=1)
                        )
                        return first, second, response.status_code
                    finally:
                        await iterator.aclose()

                first, second, status_code = asyncio.run(scenario())
                self.assertEqual(status_code, 200)
                self.assertEqual(first["id"], "2")
                self.assertEqual(first["packet"]["type"], "event")
                self.assertEqual(first["packet"]["data"]["seq"], 2)
                self.assertEqual(
                    second["packet"],
                    {"type": "status", "data": {"execution_status": "idle"}},
                )


if __name__ == "__main__":
    unittest.main()
