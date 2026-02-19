import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:cvm.db");
  }
  return db;
}

// --- Types ---

export interface RecordingRecord {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface TakeRecord {
  id: string;
  recording_id: string;
  file_path: string | null;
  take_number: number;
  created_at: number;
}

export interface ClipRecord {
  id: string;
  recording_id: string;
  take_id: string;
  source_start_time: number;
  source_end_time: number;
  position: number;
  text: string | null;
  archived: number;
  created_at: number;
}

// --- Recordings ---

export async function createRecording(opts: {
  id: string;
  name: string;
}): Promise<void> {
  const now = Date.now();
  const d = await getDb();
  await d.execute(
    "INSERT INTO recordings (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    [opts.id, opts.name, now, now]
  );
}

export async function getAllRecordings(): Promise<RecordingRecord[]> {
  const d = await getDb();
  return d.select<RecordingRecord[]>(
    "SELECT * FROM recordings ORDER BY created_at DESC"
  );
}

export async function getRecording(
  id: string
): Promise<RecordingRecord | null> {
  const d = await getDb();
  const rows = await d.select<RecordingRecord[]>(
    "SELECT * FROM recordings WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function renameRecording(id: string, name: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE recordings SET name = $1, updated_at = $2 WHERE id = $3",
    [name, Date.now(), id]
  );
}

export async function deleteRecording(id: string): Promise<void> {
  const d = await getDb();
  // CASCADE deletes takes and clips
  await d.execute("DELETE FROM recordings WHERE id = $1", [id]);
}

// --- Takes ---

export async function createTake(opts: {
  id: string;
  recordingId: string;
  filePath: string | null;
  takeNumber: number;
}): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO takes (id, recording_id, file_path, take_number, created_at) VALUES ($1, $2, $3, $4, $5)",
    [opts.id, opts.recordingId, opts.filePath, opts.takeNumber, Date.now()]
  );
}

export async function getTakesForRecording(
  recordingId: string
): Promise<TakeRecord[]> {
  const d = await getDb();
  return d.select<TakeRecord[]>(
    "SELECT * FROM takes WHERE recording_id = $1 ORDER BY take_number ASC",
    [recordingId]
  );
}

export async function updateTakeFilePath(
  id: string,
  filePath: string
): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE takes SET file_path = $1 WHERE id = $2", [
    filePath,
    id,
  ]);
}

export async function deleteTake(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM takes WHERE id = $1", [id]);
}

// --- Clips ---

export async function saveClipsForTake(
  recordingId: string,
  takeId: string,
  clips: Array<{
    id: string;
    startTime: number;
    endTime: number;
    position: number;
  }>
): Promise<void> {
  const d = await getDb();
  const now = Date.now();

  // Delete existing non-archived clips for this take (re-detection replaces them)
  await d.execute("DELETE FROM clips WHERE take_id = $1 AND archived = 0", [
    takeId,
  ]);

  for (const clip of clips) {
    await d.execute(
      "INSERT INTO clips (id, recording_id, take_id, source_start_time, source_end_time, position, archived, created_at) VALUES ($1, $2, $3, $4, $5, $6, 0, $7)",
      [
        clip.id,
        recordingId,
        takeId,
        clip.startTime,
        clip.endTime,
        clip.position,
        now,
      ]
    );
  }

  // Update recording's updated_at
  await d.execute("UPDATE recordings SET updated_at = $1 WHERE id = $2", [
    now,
    recordingId,
  ]);
}

export async function getClipsForRecording(
  recordingId: string
): Promise<ClipRecord[]> {
  const d = await getDb();
  return d.select<ClipRecord[]>(
    "SELECT * FROM clips WHERE recording_id = $1 AND archived = 0 ORDER BY position ASC",
    [recordingId]
  );
}

export async function archiveClip(clipId: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE clips SET archived = 1 WHERE id = $1", [clipId]);
}

export async function restoreClip(clipId: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE clips SET archived = 0 WHERE id = $1", [clipId]);
}

export async function reorderClips(
  recordingId: string,
  clipIds: string[]
): Promise<void> {
  const d = await getDb();
  for (let i = 0; i < clipIds.length; i++) {
    await d.execute(
      "UPDATE clips SET position = $1 WHERE id = $2 AND recording_id = $3",
      [i, clipIds[i], recordingId]
    );
  }
}

export async function getNextClipPosition(
  recordingId: string
): Promise<number> {
  const d = await getDb();
  const rows = await d.select<Array<{ max_pos: number | null }>>(
    "SELECT MAX(position) as max_pos FROM clips WHERE recording_id = $1 AND archived = 0",
    [recordingId]
  );
  return (rows[0]?.max_pos ?? -1) + 1;
}
