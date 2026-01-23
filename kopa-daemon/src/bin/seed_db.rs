use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use kopa_daemon::db::init_db;
use rand::Rng;
use rusqlite::params;

const WORDS: &[&str] = &[
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "I", "it", "for", "not", "on",
    "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say",
    "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so",
    "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
    "time", "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
    "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over",
    "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "code", "file",
    "copy", "paste", "text", "data", "system", "user", "program", "function", "error", "debug",
    "test", "build", "run", "server", "client", "network", "database", "query", "hello", "world",
    "foo", "bar", "baz", "example", "sample", "demo", "project", "module",
];

fn random_words(rng: &mut impl Rng, target_len: usize) -> String {
    let mut result = String::with_capacity(target_len);
    while result.len() < target_len {
        if !result.is_empty() {
            result.push(' ');
        }
        let Some(word) = WORDS.get(rng.random_range(0..WORDS.len())) else {
            break;
        };
        result.push_str(word);
    }
    result
}

fn main() -> Result<()> {
    let mut conn = init_db()?;
    let total: i64 = 1_000_000;
    let batch_size: i64 = 50_000;
    let batches = total / batch_size;

    let base_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System time before UNIX epoch")?
        .as_secs() as i64;

    let mut rng = rand::rng();
    for batch in 0..batches {
        let tx = conn.transaction()?;
        {
            let mut insert_clipboard = tx.prepare(
                "INSERT INTO clipboard_entries (content_type, created_at)
                VALUES (?1, ?2)",
            )?;
            let mut insert_text = tx.prepare(
                "INSERT INTO text_entries (entry_id, content)
                VALUES (?1, ?2)",
            )?;

            for _ in 0..batch_size {
                let len = rng.random_range(20..=500) as usize;
                let content = random_words(&mut rng, len);
                let created_at = base_time - rng.random_range(0..=86_400);
                insert_clipboard.execute(params!["text", created_at])?;
                let entry_id = tx.last_insert_rowid();
                insert_text.execute(params![entry_id, content])?;
            }
        }
        tx.commit()?;
        println!("Progress: {}/{}", (batch + 1) * batch_size, total);
    }

    Ok(())
}
