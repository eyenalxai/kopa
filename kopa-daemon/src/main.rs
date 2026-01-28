use std::{thread, time::Duration};

use anyhow::Result;

mod clipboard;
mod db;
mod ipc;

fn run_clipboard_monitor() -> Result<()> {
    let mut last_contents: Option<Vec<u8>> = None;
    let mut conn = db::init_db()?;

    loop {
        let contents = clipboard::read_text()?;
        match contents {
            None => {
                last_contents = None;
            }
            Some(bytes) => {
                let is_same = last_contents
                    .as_ref()
                    .is_some_and(|previous| previous == &bytes);
                if !is_same {
                    let text = String::from_utf8_lossy(&bytes);
                    db::save_text_entry(&mut conn, &text)?;
                    last_contents = Some(bytes);
                }
            }
        }

        thread::sleep(Duration::from_millis(300));
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<()> {
    thread::spawn(|| {
        loop {
            if let Err(error) = run_clipboard_monitor() {
                eprintln!("Clipboard monitor error: {error:?}");
                thread::sleep(Duration::from_secs(1));
            }
        }
    });

    ipc::run_server().await
}
