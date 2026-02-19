-- Drop old tables and recreate with new structure:
-- Recording (project) → Takes (OBS video files) → Clips (unified timeline)

DROP TABLE IF EXISTS clips;
DROP TABLE IF EXISTS videos;

-- Recordings: named projects that group multiple takes
CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Takes: individual OBS recording files within a recording
CREATE TABLE IF NOT EXISTS takes (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL,
    file_path TEXT,
    take_number INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

-- Clips: segments from takes, ordered in a unified timeline per recording
CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL,
    take_id TEXT NOT NULL,
    source_start_time REAL NOT NULL,
    source_end_time REAL NOT NULL,
    position INTEGER NOT NULL,
    text TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
    FOREIGN KEY (take_id) REFERENCES takes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_takes_recording_id ON takes(recording_id);
CREATE INDEX IF NOT EXISTS idx_clips_recording_id ON clips(recording_id);
CREATE INDEX IF NOT EXISTS idx_clips_take_id ON clips(take_id);
CREATE INDEX IF NOT EXISTS idx_clips_position ON clips(recording_id, position);
