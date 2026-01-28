use anyhow::Result;
use rusqlite::{Connection, params};

use super::types::TextEntry;

pub fn get_text_entries(
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
            let rows = stmt.query_map(params![cursor, limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                ORDER BY ce.created_at DESC
                LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
    }

    Ok(finalize_page(entries, limit))
}

pub fn search_text_entries(
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
            let rows = stmt.query_map(params![fts_query, cursor, limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
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
            let rows = stmt.query_map(params![fts_query, limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
    }

    if entries.is_empty() {
        return search_with_like(conn, trimmed, cursor, limit);
    }

    Ok(finalize_page(entries, limit))
}

pub fn search_with_like(
    conn: &Connection,
    query: &str,
    cursor: Option<i64>,
    limit: u32,
) -> Result<(Vec<TextEntry>, Option<i64>)> {
    let like_query = format!("%{}%", escape_like(query));
    let mut entries = Vec::new();
    let limit_plus_one = i64::from(limit + 1);

    match cursor {
        Some(cursor) => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                WHERE te.content LIKE ?1 ESCAPE '\\' AND ce.created_at < ?2
                ORDER BY ce.created_at DESC
                LIMIT ?3",
            )?;
            let rows = stmt.query_map(params![like_query, cursor, limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT ce.id, te.content, ce.created_at
                FROM clipboard_entries ce
                JOIN text_entries te ON ce.id = te.entry_id
                WHERE te.content LIKE ?1 ESCAPE '\\'
                ORDER BY ce.created_at DESC
                LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![like_query, limit_plus_one], map_entry)?;
            entries.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
    }

    Ok(finalize_page(entries, limit))
}

fn map_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<TextEntry> {
    Ok(TextEntry {
        id: row.get(0)?,
        content: row.get(1)?,
        created_at: row.get(2)?,
    })
}

fn finalize_page(mut entries: Vec<TextEntry>, limit: u32) -> (Vec<TextEntry>, Option<i64>) {
    if entries.len() > limit as usize {
        entries.truncate(limit as usize);
        let next_cursor = entries.last().map(|entry| entry.created_at);
        (entries, next_cursor)
    } else {
        (entries, None)
    }
}

fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn to_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| {
            let escaped = term.replace('"', "\"\"");
            format!("\"{escaped}\"*")
        })
        .collect::<Vec<String>>()
        .join(" ")
}
