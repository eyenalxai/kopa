use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, anyhow};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::db;

pub mod handlers;
pub mod search;
pub mod types;

pub use types::*;

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

    let conn = db::init_db()?;
    let response = tokio::task::spawn_blocking(move || handlers::handle_request(conn, request))
        .await
        .context("IPC handler task failed")??;

    write_response(&mut writer, &response).await?;
    Ok(())
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

fn socket_path() -> Result<PathBuf> {
    let dir = db::data_dir()?;
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create data directory {}", dir.display()))?;
    Ok(dir.join("kopa.sock"))
}
