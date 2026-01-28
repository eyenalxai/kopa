use anyhow::{Context, Result};
use rusqlite::{Connection, params};

use crate::clipboard;
use super::search::{get_text_entries, search_text_entries};
use super::types::{DEFAULT_PAGE_SIZE, Request, Response};

pub fn handle_request(conn: Connection, request: Request) -> Result<Response> {
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
        Request::CopyToClipboard { entry_id } => {
            let content = get_entry_content(&conn, entry_id)?;
            clipboard::copy_text(content)?;
            Ok(Response::Success)
        }
        Request::CopyTextToClipboard { content } => {
            clipboard::copy_text(content)?;
            Ok(Response::Success)
        }
    }
}

fn get_entry_content(conn: &Connection, entry_id: i64) -> Result<String> {
    conn.query_row(
        "SELECT te.content FROM text_entries te WHERE te.entry_id = ?1",
        params![entry_id],
        |row| row.get(0),
    )
    .context("Entry not found")
}
