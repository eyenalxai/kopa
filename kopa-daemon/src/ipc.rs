use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, anyhow};
use directories::ProjectDirs;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::db;

const DEFAULT_PAGE_SIZE: u32 = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEntry {
    pub id: i64,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Request {
    ListEntries {
        cursor: Option<i64>,
        limit: Option<u32>,
    },
    SearchEntries {
        query: String,
        cursor: Option<i64>,
        limit: Option<u32>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Response {
    Entries {
        entries: Vec<TextEntry>,
        next_cursor: Option<i64>,
    },
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
        Request::ListEntries { cursor, limit } => {
            let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
            let (entries, next_cursor) = get_text_entries(&conn, cursor, limit)?;
            Ok(Response::Entries {
                entries,
                next_cursor,
            })
        }
        Request::SearchEntries {
            query,
            cursor,
            limit,
        } => {
            let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE);
            let (entries, next_cursor) = search_text_entries(&conn, &query, cursor, limit)?;
            Ok(Response::Entries {
                entries,
                next_cursor,
            })
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

fn get_text_entries(
    conn: &Connection,
    cursor: Option<i64>,
    limit: u32,
) -> Result<(Vec<TextEntry>, Option<i64>)> {
    let limit_plus_one = i64::from(limit + 1);
    let mut entries = Vec::new();

    match cursor {
        Some(cursor) => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                WHERE ce.created_at < ?1
                ORDER BY ce.created_at DESC
                LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![cursor, limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                ORDER BY ce.created_at DESC
                LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
    }

    if entries.len() > limit as usize {
        entries.truncate(limit as usize);
        let next_cursor = entries.last().map(|entry| entry.created_at);
        Ok((entries, next_cursor))
    } else {
        Ok((entries, None))
    }
}

fn search_text_entries(
    conn: &Connection,
    query: &str,
    cursor: Option<i64>,
    limit: u32,
) -> Result<(Vec<TextEntry>, Option<i64>)> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return get_text_entries(conn, cursor, limit);
    }

    if trimmed.len() < 3 {
        return search_with_like(conn, trimmed, cursor, limit);
    }

    let fts_query = to_fts_query(trimmed);
    let mut entries = Vec::new();
    let limit_plus_one = i64::from(limit + 1);

    match cursor {
        Some(cursor) => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                JOIN text_entries_fts fts ON te.entry_id = fts.rowid
                WHERE text_entries_fts MATCH ?1 AND ce.created_at < ?2
                ORDER BY bm25(text_entries_fts), ce.created_at DESC
                LIMIT ?3",
            )?;
            let rows = stmt.query_map(params![fts_query, cursor, limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                JOIN text_entries_fts fts ON te.entry_id = fts.rowid
                WHERE text_entries_fts MATCH ?1
                ORDER BY bm25(text_entries_fts), ce.created_at DESC
                LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![fts_query, limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
    }

    if entries.is_empty() {
        return search_with_like(conn, trimmed, cursor, limit);
    }

    if entries.len() > limit as usize {
        entries.truncate(limit as usize);
        let next_cursor = entries.last().map(|entry| entry.created_at);
        Ok((entries, next_cursor))
    } else {
        Ok((entries, None))
    }
}

fn search_with_like(
    conn: &Connection,
    query: &str,
    cursor: Option<i64>,
    limit: u32,
) -> Result<(Vec<TextEntry>, Option<i64>)> {
    let like_query = format!("%{query}%");
    let mut entries = Vec::new();
    let limit_plus_one = i64::from(limit + 1);

    match cursor {
        Some(cursor) => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                WHERE te.content LIKE ?1 AND ce.created_at < ?2
                ORDER BY ce.created_at DESC
                LIMIT ?3",
            )?;
            let rows = stmt.query_map(params![like_query, cursor, limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                WHERE te.content LIKE ?1
                ORDER BY ce.created_at DESC
                LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![like_query, limit_plus_one], |row| {
                Ok(TextEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
    }

    if entries.len() > limit as usize {
        entries.truncate(limit as usize);
        let next_cursor = entries.last().map(|entry| entry.created_at);
        Ok((entries, next_cursor))
    } else {
        Ok((entries, None))
    }
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
