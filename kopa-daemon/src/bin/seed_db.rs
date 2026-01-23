use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use kopa_daemon::db::init_db;
use rand::Rng;
use rusqlite::params;

fn random_string(rng: &mut impl Rng, len: usize) -> String {
    let mut value = String::with_capacity(len);
    for _ in 0..len {
        let byte = rng.random_range(b'a'..=b'z');
        value.push(byte as char);
    }
    value
}

fn main() -> Result<()> {
    let mut conn = init_db()?;
    let total: i64 = 10_000;
    let batch_size: i64 = 10_000;
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
                let len = rng.random_range(100..=10_000) as usize;
                let content = random_string(&mut rng, len);
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
