use std::io::Read;
use anyhow::{Context, Result};
use wl_clipboard_rs::paste::{ClipboardType, Error as PasteError, MimeType, Seat, get_contents};
use wl_clipboard_rs::copy::{MimeType as CopyMimeType, Options, Source};

pub fn read_text() -> Result<Option<Vec<u8>>> {
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

pub fn copy_text(content: String) -> Result<()> {
    Options::new()
        .copy(Source::Bytes(content.into_bytes().into()), CopyMimeType::Text)
        .context("Failed to copy entry to clipboard")?;
    Ok(())
}
