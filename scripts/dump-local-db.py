#!/usr/bin/env python3
"""Dump local SQLite rows (db/custom.db) to JSON for the Turso migration."""
import json
import sqlite3
import sys

con = sqlite3.connect('/home/z/my-project/db/custom.db')
con.row_factory = sqlite3.Row
cur = con.cursor()

data = {}

# Settings: keep VAPID + legacy global fish.audio config (the first registered
# account claims them). Skip the legacy global access_token (superseded by
# per-user tokens in the multi-user system).
KEEP_SETTING_KEYS = {'fish_audio_api_key', 'fish_audio_voice_id', 'vapid_public', 'vapid_private'}
rows = cur.execute("SELECT key, value, updatedAt FROM Setting").fetchall()
data['settings'] = [
    {'key': r['key'], 'value': r['value'], 'updatedAt': r['updatedAt']}
    for r in rows if r['key'] in KEEP_SETTING_KEYS
]

# Calls: full history (userId stays NULL -> claimed by the first registered account)
rows = cur.execute("""
    SELECT id, userId, source, taskName, summary, result, message, urgency, status,
           createdAt, answeredAt, endedAt, durationSec, transcript
    FROM Call
""").fetchall()
data['calls'] = [dict(r) for r in rows]

# Users / push subscriptions
data['users'] = [dict(r) for r in cur.execute(
    "SELECT id, username, passwordHash, displayName, accessToken, fishApiKey, fishVoiceId, createdAt FROM User"
).fetchall()]
data['pushSubs'] = [dict(r) for r in cur.execute(
    "SELECT id, userId, endpoint, p256dh, auth, createdAt FROM PushSubscription"
).fetchall()]

con.close()

with open('/tmp/local_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

print(f"settings={len(data['settings'])} calls={len(data['calls'])} users={len(data['users'])} pushSubs={len(data['pushSubs'])}")
sys.exit(0)
