CREATE TABLE IF NOT EXISTS sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    mode           TEXT    NOT NULL,
    started_at     TEXT    NOT NULL,
    ended_at       TEXT,
    n_questions    INTEGER NOT NULL DEFAULT 0,
    total_score    REAL    NOT NULL DEFAULT 0,
    rating_before  REAL,
    rating_after   REAL
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

CREATE TABLE IF NOT EXISTS model_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    rating      REAL NOT NULL,
    bins        TEXT NOT NULL,
    residuals   TEXT NOT NULL,
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    daily_goal      INTEGER NOT NULL DEFAULT 20,
    session_length  INTEGER NOT NULL DEFAULT 10
);
