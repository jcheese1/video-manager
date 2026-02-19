use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("FFmpeg error: {0}")]
    FFmpeg(String),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Shell error: {0}")]
    Shell(#[from] tauri_plugin_shell::Error),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct DetectedClip {
    input_video: String,
    start_time: f64,
    end_time: f64,
}

/// Detect silence in a video file using ffmpeg
/// Returns clips (non-silent segments)
#[tauri::command]
async fn detect_silence(
    app: tauri::AppHandle,
    file_path: String,
    start_time: Option<f64>,
    threshold: Option<i32>,
) -> Result<Vec<DetectedClip>, AppError> {
    let start = start_time.unwrap_or(0.0);
    let threshold_db = threshold.unwrap_or(-50);

    println!("Detecting silence in: {}", file_path);
    println!("Start time: {}", start);
    println!("Threshold: {}dB", threshold_db);

    // Use ffmpeg silencedetect filter
    let silence_filter = format!("silencedetect=n={}dB:d=0.8", threshold_db);

    let output = app
        .shell()
        .sidecar("ffmpeg")?
        .args([
            "-ss",
            &start.to_string(),
            "-i",
            &file_path,
            "-af",
            &silence_filter,
            "-f",
            "null",
            "-",
        ])
        .output()
        .await
        .map_err(|e| AppError::FFmpeg(format!("Failed to run ffmpeg: {}", e)))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    println!("FFmpeg stderr output:");
    println!("{}", stderr);

    // Parse ffmpeg output for silence periods
    #[derive(Debug)]
    struct SilencePeriod {
        end: f64,
        duration: f64,
    }

    let mut silence_periods: Vec<SilencePeriod> = Vec::new();

    for line in stderr.lines() {
        if line.contains("silence_start:") {
            if let Some(time_str) = line.split("silence_start:").nth(1) {
                if let Ok(time) = time_str.trim().split_whitespace().next().unwrap_or("0").parse::<f64>() {
                    println!("Found silence_start: {}", time);
                }
            }
        } else if line.contains("silence_end:") {
            if let Some(time_str) = line.split("silence_end:").nth(1) {
                let parts: Vec<&str> = time_str.split('|').collect();
                if let Some(end_str) = parts.get(0) {
                    if let Ok(end_time) = end_str.trim().parse::<f64>() {
                        if let Some(duration_part) = parts.get(1) {
                            if let Some(duration_str) = duration_part.split(':').nth(1) {
                                if let Ok(duration) = duration_str.trim().parse::<f64>() {
                                    println!("Found silence_end: {}, duration: {}", end_time, duration);
                                    silence_periods.push(SilencePeriod {
                                        end: end_time + start,
                                        duration,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    println!("Silence periods: {:?}", silence_periods);

    // Get total duration from ffprobe
    let duration_output = app
        .shell()
        .sidecar("ffprobe")
        .ok()
        .map(|cmd| {
            cmd.args([
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                &file_path,
            ])
        });

    let total_duration = if let Some(cmd) = duration_output {
        cmd.output()
            .await
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    } else {
        0.0
    };

    println!("Total video duration: {}s", total_duration);

    // Convert silence periods to speech clips.
    // Speech = the gaps between silence regions.
    //
    // For each silence period: start = end - duration
    // Speech segments:
    //   1. [video_start .. first_silence_start]  (if speech before first silence)
    //   2. [silence_N.end .. silence_N+1.start]  (gaps between silences)
    //   3. [last_silence.end .. video_end]        (if speech after last silence)

    const END_PADDING: f64 = 0.3;
    const MINIMUM_CLIP_LENGTH: f64 = 1.0;

    let mut clips = Vec::new();

    let add_clip = |clips: &mut Vec<DetectedClip>, clip_start: f64, clip_end: f64, pad: bool| {
        let final_end = if pad { clip_end + END_PADDING } else { clip_end };
        let final_end = if total_duration > 0.0 { final_end.min(total_duration) } else { final_end };
        let duration = final_end - clip_start;

        if duration >= MINIMUM_CLIP_LENGTH && clip_start < final_end {
            println!("Creating clip: {:.2} -> {:.2} (duration: {:.1}s)", clip_start, final_end, duration);
            clips.push(DetectedClip {
                input_video: file_path.clone(),
                start_time: clip_start,
                end_time: final_end,
            });
        } else {
            println!("Skipping short clip: {:.2} -> {:.2} ({:.1}s < {:.1}s)",
                     clip_start, final_end, duration, MINIMUM_CLIP_LENGTH);
        }
    };

    if silence_periods.is_empty() {
        if total_duration > MINIMUM_CLIP_LENGTH {
            add_clip(&mut clips, start, total_duration, false);
        }
    } else {
        // 1. Speech before first silence
        let first_silence_start = silence_periods[0].end - silence_periods[0].duration;
        if first_silence_start - start > MINIMUM_CLIP_LENGTH {
            add_clip(&mut clips, start, first_silence_start, false);
        }

        // 2. Gaps between consecutive silences
        for i in 0..silence_periods.len() - 1 {
            let current_silence = &silence_periods[i];
            let next_silence = &silence_periods[i + 1];

            let clip_start = current_silence.end;
            let clip_end = next_silence.end - next_silence.duration;
            add_clip(&mut clips, clip_start, clip_end, true);
        }

        // 3. Speech after last silence
        let last_silence = &silence_periods[silence_periods.len() - 1];
        if total_duration - last_silence.end > MINIMUM_CLIP_LENGTH {
            add_clip(&mut clips, last_silence.end, total_duration, false);
        }
    }

    println!("Total clips detected: {}", clips.len());

    Ok(clips)
}

/// Export clips to a single video file using ffmpeg concat
#[tauri::command]
async fn export_video_clips(
    app: tauri::AppHandle,
    clips_json: String,
    output_path: String,
) -> Result<String, AppError> {
    let clips: Vec<DetectedClip> = serde_json::from_str(&clips_json)?;

    if clips.is_empty() {
        return Err(AppError::NotFound("No clips provided".to_string()));
    }

    let temp_dir = "/tmp";
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mut temp_files = Vec::new();

    // Step 1: Extract each clip to a temporary file
    for (i, clip) in clips.iter().enumerate() {
        let temp_file = format!("{}/clip_{}_{}.mp4", temp_dir, timestamp, i);

        let duration = clip.end_time - clip.start_time;

        let extract_output = app
            .shell()
            .sidecar("ffmpeg")?
            .args([
                "-ss", &clip.start_time.to_string(),
                "-t", &duration.to_string(),
                "-i", &clip.input_video,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                "-y",
                &temp_file,
            ])
            .output()
            .await
            .map_err(|e| AppError::FFmpeg(format!("Failed to extract clip {}: {}", i, e)))?;

        if !extract_output.status.success() {
            for f in &temp_files {
                let _ = std::fs::remove_file(f);
            }
            return Err(AppError::FFmpeg(format!(
                "Failed to extract clip {}: {}",
                i,
                String::from_utf8_lossy(&extract_output.stderr)
            )));
        }

        temp_files.push(temp_file);
    }

    // Step 2: Create concat file
    let concat_file = format!("{}/concat_{}.txt", temp_dir, timestamp);
    let mut concat_content = String::new();
    for temp_file in &temp_files {
        concat_content.push_str(&format!("file '{}'\n", temp_file));
    }

    tokio::fs::write(&concat_file, concat_content)
        .await
        .map_err(|e| AppError::Io(e))?;

    // Step 3: Concatenate all clips
    let concat_output = app
        .shell()
        .sidecar("ffmpeg")?
        .args([
            "-f", "concat",
            "-safe", "0",
            "-i", &concat_file,
            "-c", "copy",
            "-y",
            &output_path,
        ])
        .output()
        .await
        .map_err(|e| AppError::FFmpeg(format!("Failed to concatenate clips: {}", e)))?;

    // Clean up temp files
    for temp_file in &temp_files {
        let _ = std::fs::remove_file(temp_file);
    }
    let _ = std::fs::remove_file(&concat_file);

    if !concat_output.status.success() {
        return Err(AppError::FFmpeg(format!(
            "Failed to concatenate clips: {}",
            String::from_utf8_lossy(&concat_output.stderr)
        )));
    }

    Ok(output_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:course-video-manager.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "create initial tables",
                            sql: include_str!("../migrations/001_initial.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "add video file_path and clip archived flag",
                            sql: include_str!("../migrations/002_add_video_filepath_and_clip_archived.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 3,
                            description: "restructure to recordings/takes/clips",
                            sql: include_str!("../migrations/003_restructure_recordings_takes_clips.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            detect_silence,
            export_video_clips,
        ])
        .setup(|app| {
            // Warm up ffmpeg/ffprobe sidecars in background.
            // First invocation on macOS is slow due to Gatekeeper scan
            // and Rosetta 2 JIT translation (x86_64 → arm64).
            // Running -version eagerly ensures the real calls are fast.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let shell = handle.shell();
                let _ = tokio::join!(
                    async {
                        if let Ok(cmd) = shell.sidecar("ffmpeg") {
                            let _ = cmd.args(["-version"]).output().await;
                        }
                    },
                    async {
                        if let Ok(cmd) = shell.sidecar("ffprobe") {
                            let _ = cmd.args(["-version"]).output().await;
                        }
                    },
                );
                println!("ffmpeg/ffprobe sidecars warmed up");
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
