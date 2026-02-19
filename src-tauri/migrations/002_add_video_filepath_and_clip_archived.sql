-- Add file_path to videos (the OBS recording file path)
ALTER TABLE videos ADD COLUMN file_path TEXT;

-- Add archived flag for soft delete on clips
ALTER TABLE clips ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
