CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mode         TEXT    NOT NULL,
    started_at   TEXT    NOT NULL,
    ended_at     TEXT,
    n_questions  INTEGER NOT NULL DEFAULT 0,
    total_score  REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL REFERENCES sessions(id),
    ts               TEXT    NOT NULL,
    operation        TEXT    NOT NULL,
    operands         TEXT    NOT NULL,
    correct_answer   INTEGER NOT NULL,
    given_answer     INTEGER,
    is_correct       INTEGER NOT NULL,
    difficulty       REAL    NOT NULL,
    features         TEXT    NOT NULL,
    ms_to_first_key  INTEGER,
    ms_to_submit     INTEGER NOT NULL,
    trick_slug       TEXT,
    score            REAL    NOT NULL DEFAULT 0
);
