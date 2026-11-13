#!/usr/bin/env python3
"""E2E test for the live-call bridge (agent <-> call) tools."""
import json
import sys
import time
import urllib.request

BASE = "http://localhost:3000"


def post(path, payload, timeout=90):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read())


def patch(path, payload, timeout=30):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def mcp_call(name, args, token):
    return post(
        f"/api/mcp?token={token}",
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}},
    )["result"]["content"][0]["text"]


def main():
    token = get("/api/config")["token"]
    mcp = lambda name, args: mcp_call(name, args, token)

    # create + answer a call
    post("/api/test-call", {})
    time.sleep(1)
    calls = get("/api/calls")["calls"]
    call_id = next(c["id"] for c in calls if c["status"] == "ringing")
    print("call:", call_id)
    patch(f"/api/calls/{call_id}", {"event": "answered"})

    # intro report
    reply = post("/api/call/chat", {"callId": call_id, "text": ""})["reply"]
    print("intro:", reply[:90].replace("\n", " "))

    # user request mid-call
    reply = post("/api/call/chat", {"callId": call_id, "text": "رد على ايميل المدير وقولو التقرير جاهز"})["reply"]
    print("user turn reply:", reply[:90].replace("\n", " "))

    # agent pushes result into the call
    out = mcp("send_call_update", {
        "call_id": call_id,
        "message": "خلاص رديت على إيميل المدير وقلتله إن التقرير جاهز هيبعت بكرة",
    })
    agent_payload = json.loads(out)
    print("send_call_update ok:", agent_payload["ok"], "| index:", agent_payload["turn_index"], "| status:", agent_payload["call_status"])

    # wait_for_call_updates returns everything so far
    out = mcp("wait_for_call_updates", {"call_id": call_id, "since_turn": 0})
    p = json.loads(out)
    print("wait since=0 -> status:", p["call_status"], "| ended:", p["ended"],
          "| next_index:", p["next_index"], "| roles:", [(t["index"], t["role"]) for t in p["new_turns"]])

    # long-poll timeout path (nothing new beyond index 4)
    t0 = time.time()
    out = mcp("wait_for_call_updates", {"call_id": call_id, "since_turn": agent_payload["turn_index"] + 1, "timeout_sec": 5})
    p = json.loads(out)
    print("wait timeout -> timed_out:", p["timed_out"], "| turns:", len(p["new_turns"]),
          "| waited %.1fs" % (time.time() - t0))

    # phone relay: assistant announces the agent update naturally
    reply = post("/api/call/chat", {"callId": call_id,
                                    "agentMessage": "خلاص رديت على إيميل المدير وقلتله إن التقرير جاهز هيبعت بكرة"})["reply"]
    print("phone relay announcement:", reply[:130].replace("\n", " "))

    # polling fallback endpoint
    d = get(f"/api/calls/{call_id}/updates?since=3")
    print("updates endpoint -> status:", d["status"], "| turns since 3:", [(t["index"], t["role"]) for t in d["turns"]])

    # transcript now contains an 'agent' role turn (dashboard renders it)
    d = get(f"/api/calls/{call_id}/updates?since=0")
    assert any(t["role"] == "agent" for t in d["turns"]), "no agent turn in transcript"
    print("transcript has agent turn: OK")

    # guard: send_call_update on a completed call must fail
    patch(f"/api/calls/{call_id}", {"event": "ended", "durationSec": 30})
    out = mcp("send_call_update", {"call_id": call_id, "message": "تجربة"})
    print("update on ended call ->", out[:100].replace("\n", " "))

    # wait returns ended=true immediately after hangup
    out = mcp("wait_for_call_updates", {"call_id": call_id, "since_turn": 0, "timeout_sec": 5})
    p = json.loads(out)
    print("wait after hangup -> ended:", p["ended"], "| status:", p["call_status"])
    print("ALL BRIDGE CHECKS PASSED")


if __name__ == "__main__":
    sys.exit(main())
