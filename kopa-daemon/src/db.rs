use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow};
use directories::ProjectDirs;
use rusqlite::{Connection, params};

fn data_dir() -> Result<PathBuf> {
    let dirs = ProjectDirs::from("com", "kopa", "kopa")
        .ok_or_else(|| anyhow!("Unable to resolve data directory"))?;
    Ok(dirs.data_local_dir().to_path_buf())
}

pub fn init_db() -> Result<Connection> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create data directory {}", dir.display()))?;

    let db_path = dir.join("kopa.db");
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS clipboard_entries (
            id INTEGER PRIMARY KEY,
            content_type TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS text_entries (
            entry_id INTEGER PRIMARY KEY REFERENCES clipboard_entries(id) ON DELETE CASCADE,
            content TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS image_entries (
            entry_id INTEGER PRIMARY KEY REFERENCES clipboard_entries(id) ON DELETE CASCADE,
            content BLOB NOT NULL,
            mime_type TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS text_entries_fts USING fts5(
            content,
            content='text_entries',
            content_rowid='entry_id'
        );
        CREATE TRIGGER IF NOT EXISTS text_entries_ai
            AFTER INSERT ON text_entries
        BEGIN
            INSERT INTO text_entries_fts(rowid, content)
            VALUES (new.entry_id, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS text_entries_ad
            AFTER DELETE ON text_entries
        BEGIN
            INSERT INTO text_entries_fts(text_entries_fts, rowid, content)
            VALUES ('delete', old.entry_id, old.content);
        END;
        CREATE INDEX IF NOT EXISTS idx_created_at
            ON clipboard_entries(created_at DESC);",
    )?;

    Ok(conn)
}

pub fn save_text_entry(conn: &mut Connection, content: &str) -> Result<()> {
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System time before UNIX epoch")?
        .as_secs() as i64;

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO clipboard_entries (content_type, created_at)
        VALUES (?1, ?2)",
        params!["text", created_at],
    )?;
    let entry_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO text_entries (entry_id, content)
        VALUES (?1, ?2)",
        params![entry_id, content],
    )?;
    tx.commit()?;

    Ok(())
}
