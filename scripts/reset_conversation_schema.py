from __future__ import annotations

from sqlalchemy import text
from sqlmodel import SQLModel, Session

from app.conversation import domain as _conversation_domain  # noqa: F401
from app.todo.core.database import engine
from app.todo.domain import models as _todo_domain_models  # noqa: F401


def main() -> None:
    drop_statements = [
        "DROP TABLE IF EXISTS conversation_event CASCADE;",
        "DROP TABLE IF EXISTS conversation CASCADE;",
        "DROP TABLE IF EXISTS conversation_event_old CASCADE;",
        "DROP TABLE IF EXISTS conversation_session CASCADE;",
    ]

    with Session(engine) as session:
        for statement in drop_statements:
            print(f"[reset] {statement}")
            session.exec(text(statement))
        session.commit()

    SQLModel.metadata.create_all(engine)
    print("[reset] conversation schema recreated")


if __name__ == "__main__":
    main()
