use std::{io::Read, thread, time::Duration};

use anyhow::Result;
use wl_clipboard_rs::paste::{ClipboardType, Error as PasteError, MimeType, Seat, get_contents};

fn read_clipboard_text() -> Result<Option<Vec<u8>>> {
    match get_contents(ClipboardType::Regular, Seat::Unspecified, MimeType::Text) {
        Ok((mut pipe, _)) => {
            let mut contents = Vec::new();
            pipe.read_to_end(&mut contents)?;
            Ok(Some(contents))
        }
        Err(PasteError::NoSeats | PasteError::ClipboardEmpty | PasteError::NoMimeType) => Ok(None),
        Err(err) => Err(anyhow::Error::new(err)),
    }
}

fn main() -> Result<()> {
    let mut last_contents: Option<Vec<u8>> = None;

    loop {
        let contents = read_clipboard_text()?;
        match contents {
            None => {
                last_contents = None;
            }
            Some(bytes) => {
                let is_same = last_contents
                    .as_ref()
                    .is_some_and(|previous| previous == &bytes);
                if !is_same {
                    println!("{}", String::from_utf8_lossy(&bytes));
                    last_contents = Some(bytes);
                }
            }
        }

        thread::sleep(Duration::from_millis(300));
    }
}
