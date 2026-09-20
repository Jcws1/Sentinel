"""Versioned internal storage only; decoded canonical JSON is byte-for-byte exact.

Legacy TEXT remains untouched. BLOB v1 is SNTLZ + version byte, a big-endian
decoded byte length, SHA-256 of the UTF-8 text, then one zlib stream. SQLite's
user_version 5 gates old binaries; world/checkpoint/wire versions do not change.
"""
import hashlib
import sqlite3
import struct
import zlib

MAGIC = b"SNTLZ\x01"
HEADER_BYTES = len(MAGIC) + 4 + 32
MAX_DECODED_BYTES = 16 * 1024 * 1024
MIN_ENCODED_BYTES = 1024


class StorageCorruptionError(sqlite3.DatabaseError):
    """Use the existing unavailable-storage/rollback boundary; never guess data."""


def encode_text(text: str) -> str | bytes:
    raw = text.encode("utf-8")
    # Preserve historical TEXT support for larger valid payloads. The bounded
    # binary representation is optional and never rejects previously valid JSON.
    if not MIN_ENCODED_BYTES <= len(raw) <= MAX_DECODED_BYTES:
        return text
    compressed = zlib.compress(raw, level=1)
    if len(compressed) + HEADER_BYTES >= len(raw):
        return text
    return MAGIC + struct.pack(">I", len(raw)) + hashlib.sha256(raw).digest() + compressed


def decode_text(value: str | bytes) -> str:
    if isinstance(value, str):
        return value  # Validation/adaptation remains the strict historical reader's job.
    if not isinstance(value, bytes) or not value.startswith(MAGIC):
        raise StorageCorruptionError("Unsupported recording payload representation")
    if not HEADER_BYTES < len(value) <= MAX_DECODED_BYTES + HEADER_BYTES:
        raise StorageCorruptionError("Invalid recording payload size")
    size = struct.unpack(">I", value[len(MAGIC):len(MAGIC) + 4])[0]
    if not 0 < size <= MAX_DECODED_BYTES:
        raise StorageCorruptionError("Recording payload exceeds decoding limit")
    checksum = value[len(MAGIC) + 4:HEADER_BYTES]
    try:
        decoder = zlib.decompressobj()
        raw = decoder.decompress(value[HEADER_BYTES:], size + 1)
        if len(raw) != size or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise StorageCorruptionError("Incomplete or oversized recording payload")
        if hashlib.sha256(raw).digest() != checksum:
            raise StorageCorruptionError("Recording payload checksum mismatch")
        return raw.decode("utf-8", errors="strict")
    except (zlib.error, UnicodeError):
        raise StorageCorruptionError("Invalid recording payload encoding") from None
