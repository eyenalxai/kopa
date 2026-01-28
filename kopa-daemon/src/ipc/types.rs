use serde::{Deserialize, Serialize};

pub const DEFAULT_PAGE_SIZE: u32 = 50;

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
    CopyToClipboard {
        entry_id: i64,
    },
    CopyTextToClipboard {
        content: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Response {
    Entries {
        entries: Vec<TextEntry>,
        next_cursor: Option<i64>,
    },
    Success,
    Error {
        message: String,
    },
}
