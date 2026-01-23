use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, anyhow};
use directories::ProjectDirs;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEntry {
    pub id: i64,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Request {
    ListEntries,
    SearchEntries { query: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Response {
    Entries { entries: Vec<TextEntry> },
    Error { message: String },
}

pub async fn run_server() -> Result<()> {
    let socket_path = socket_path()?;
    if socket_path.exists() {
        fs::remove_file(&socket_path)
            .with_context(|| format!("Failed to remove existing socket {}", socket_path.display()))?;
    }

    let listener = UnixListener::bind(&socket_path)
        .with_context(|| format!("Failed to bind socket {}", socket_path.display()))?;

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(async move {
            if let Err(error) = handle_connection(stream).await {
                eprintln!("IPC connection error: {error:?}");
            }
        });
    }
}

async fn handle_connection(stream: UnixStream) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut buffer = String::new();
    let mut reader = BufReader::new(reader);
    let bytes = reader.read_line(&mut buffer).await?;
    if bytes == 0 {
        let response = Response::Error {
            message: "Empty request".to_string(),
        };
        write_response(&mut writer, &response).await?;
        return Ok(());
    }

    let request: Request = serde_json::from_str(buffer.trim_end())
        .map_err(|err| anyhow!("Invalid request payload: {err}"))?;

    let response = tokio::task::spawn_blocking(move || handle_request(request))
        .await
        .context("IPC handler task failed")??;

    write_response(&mut writer, &response).await?;
    Ok(())
}

fn handle_request(request: Request) -> Result<Response> {
    let conn = db::init_db()?;
    match request {
        Request::ListEntries => {
            let entries = get_text_entries(&conn)?;
            Ok(Response::Entries { entries })
        }
        Request::SearchEntries { query } => {
            let entries = search_text_entries(&conn, &query)?;
            Ok(Response::Entries { entries })
        }
    }
}

async fn write_response(
    writer: &mut tokio::net::unix::OwnedWriteHalf,
    response: &Response,
) -> Result<()> {
    let serialized = serde_json::to_string(response)?;
    writer.write_all(serialized.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

fn get_text_entries(conn: &Connection) -> Result<Vec<TextEntry>> {
    let mut stmt = conn.prepare(
        "SELECT ce.id, te.content, ce.created_at
        FROM clipboard_entries ce
        JOIN text_entries te ON ce.id = te.entry_id
        ORDER BY ce.created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TextEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

fn search_text_entries(conn: &Connection, query: &str) -> Result<Vec<TextEntry>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return get_text_entries(conn);
    }

    if trimmed.len() < 3 {
        return search_with_like(conn, trimmed);
    }

    let fts_query = to_fts_query(trimmed);
    let mut stmt = conn.prepare(
        "SELECT ce.id, te.content, ce.created_at
        FROM clipboard_entries ce
        JOIN text_entries te ON ce.id = te.entry_id
        JOIN text_entries_fts fts ON te.entry_id = fts.rowid
        WHERE text_entries_fts MATCH ?1
        ORDER BY bm25(text_entries_fts), ce.created_at DESC",
    )?;
    let rows = stmt.query_map([fts_query], |row| {
        Ok(TextEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }

    if entries.is_empty() {
        return search_with_like(conn, trimmed);
    }

    Ok(entries)
}

fn search_with_like(conn: &Connection, query: &str) -> Result<Vec<TextEntry>> {
    let like_query = format!("%{query}%");
    let mut stmt = conn.prepare(
        "SELECT ce.id, te.content, ce.created_at
        FROM clipboard_entries ce
        JOIN text_entries te ON ce.id = te.entry_id
        WHERE te.content LIKE ?1
        ORDER BY ce.created_at DESC",
    )?;
    let rows = stmt.query_map([like_query], |row| {
        Ok(TextEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

fn to_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("{term}*"))
        .collect::<Vec<String>>()
        .join(" ")
}

fn socket_path() -> Result<PathBuf> {
    let dirs = ProjectDirs::from("com", "kopa", "kopa")
        .ok_or_else(|| anyhow!("Unable to resolve data directory"))?;
    let dir = dirs.data_local_dir();
    fs::create_dir_all(dir)
        .with_context(|| format!("Failed to create data directory {}", dir.display()))?;
    Ok(dir.join("kopa.sock"))
}
