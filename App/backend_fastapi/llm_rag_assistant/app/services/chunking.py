from __future__ import annotations


def chunk_text(content: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    normalized = " ".join(content.split())
    if not normalized:
        return []
    if len(normalized) <= chunk_size:
        return [normalized]

    chunks: list[str] = []
    step = chunk_size - overlap
    start = 0
    while start < len(normalized):
        chunks.append(normalized[start : start + chunk_size])
        if start + chunk_size >= len(normalized):
            break
        start += step
    return chunks
