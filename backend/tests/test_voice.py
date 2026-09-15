from app.voice import safe_command


def test_voice_command_allowlist_accepts_only_supported_shapes():
    assert safe_command({"action": "navigate", "target": "tracks", "summary": "Open Tracks"})
    assert safe_command({"action": "toggle_tracks", "summary": "Toggle Tracks"})
    assert safe_command({"action": "recenter_map", "summary": "Recenter map"})
    assert safe_command({"action": "draft_chat", "text": "Hold position", "summary": "Draft message"})
    assert safe_command({"action": "send_chat", "text": "Hold position", "summary": "Send message"})


def test_voice_command_allowlist_rejects_external_or_malformed_actions():
    assert safe_command({"action": "shell", "summary": "Delete files"}) is None
    assert safe_command({"action": "navigate", "target": "browser", "summary": "Open browser"}) is None
    assert safe_command({"action": "send_chat", "summary": "Missing text"}) is None
    assert safe_command({"action": "recenter_map", "summary": "Recenter", "text": "extra"}) is None
    assert safe_command({"action": "navigate", "target": "tracks", "summary": "Open", "extra": True}) is None
