#!/usr/bin/env python3
"""KAN Jira-ticketek kezelése a reformstudiosync.atlassian.net-en.

Parancsok: show, list, transitions, transition, comment.
Hitelesítés: JIRA_EMAIL + JIRA_API_TOKEN (vagy JIRA_API_TOKEN_FILE).
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("JIRA_BASE_URL", "https://reformstudiosync.atlassian.net").rstrip("/")
PROJECT_KEY = "KAN"


def auth_header():
    email = os.environ.get("JIRA_EMAIL")
    token = os.environ.get("JIRA_API_TOKEN")
    token_file = os.environ.get("JIRA_API_TOKEN_FILE")
    if not token and token_file:
        with open(token_file, encoding="utf-8") as f:
            token = f.read().strip()
    if not email or not token:
        sys.exit("Hiányzik a JIRA_EMAIL és/vagy a JIRA_API_TOKEN (vagy JIRA_API_TOKEN_FILE).")
    raw = f"{email}:{token}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def request(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE_URL}/rest/api/3{path}",
        data=data,
        method=method,
        headers={
            "Authorization": auth_header(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"Jira hiba {e.code} ({method} {path}): {detail[:500]}")


def adf_to_text(node, depth=0):
    """Atlassian Document Format → egyszerű szöveg."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    kind = node.get("type")
    children = node.get("content", [])
    if kind == "text":
        return node.get("text", "")
    if kind == "hardBreak":
        return "\n"
    if kind == "mention":
        return node.get("attrs", {}).get("text", "@?")
    if kind in ("inlineCard", "blockCard"):
        return node.get("attrs", {}).get("url", "")
    inner = "".join(adf_to_text(c, depth + 1) for c in children)
    if kind == "listItem":
        return "  " * max(depth - 2, 0) + "- " + inner.strip() + "\n"
    if kind in ("bulletList", "orderedList"):
        return inner
    if kind == "heading":
        return "#" * node.get("attrs", {}).get("level", 2) + " " + inner + "\n\n"
    if kind == "codeBlock":
        return "```\n" + inner + "\n```\n\n"
    if kind in ("paragraph", "blockquote", "panel"):
        return inner + "\n\n"
    return inner


def normalize_key(key):
    key = key.strip().upper()
    if key.isdigit():
        key = f"{PROJECT_KEY}-{key}"
    return key


def cmd_show(args):
    key = normalize_key(args.key)
    fields = "summary,status,issuetype,priority,assignee,parent,subtasks,description,labels,comment,issuelinks"
    issue = request("GET", f"/issue/{key}?fields={fields}")
    f = issue["fields"]
    print(f"{key}: {f['summary']}")
    print(f"Típus: {f['issuetype']['name']} | Státusz: {f['status']['name']}"
          + (f" | Prioritás: {f['priority']['name']}" if f.get("priority") else ""))
    print(f"Felelős: {(f.get('assignee') or {}).get('displayName', '-')}")
    if f.get("labels"):
        print("Címkék: " + ", ".join(f["labels"]))
    if f.get("parent"):
        p = f["parent"]
        print(f"Szülő: {p['key']} {p['fields']['summary']}")
    print(f"Link: {BASE_URL}/browse/{key}")
    print("\n## Leírás\n")
    print(adf_to_text(f.get("description")).strip() or "(üres)")
    if f.get("subtasks"):
        print("\n## Alfeladatok")
        for s in f["subtasks"]:
            print(f"- {s['key']} [{s['fields']['status']['name']}] {s['fields']['summary']}")
    if f.get("issuelinks"):
        print("\n## Kapcsolatok")
        for link in f["issuelinks"]:
            other = link.get("outwardIssue") or link.get("inwardIssue")
            label = link["type"]["outward" if "outwardIssue" in link else "inward"]
            print(f"- {label}: {other['key']} {other['fields']['summary']}")
    comments = (f.get("comment") or {}).get("comments", [])
    if comments:
        print("\n## Kommentek")
        for c in comments[-10:]:
            print(f"\n[{c['created'][:16]}] {c['author']['displayName']}:")
            print(adf_to_text(c["body"]).strip())


def cmd_list(args):
    jql = args.jql or f'project={PROJECT_KEY} AND statusCategory != Done ORDER BY updated DESC'
    res = request("POST", "/search/jql", {
        "jql": jql,
        "maxResults": args.max,
        "fields": ["summary", "status", "issuetype"],
    })
    issues = res.get("issues", [])
    if not issues:
        print("Nincs találat.")
    for i in issues:
        f = i["fields"]
        print(f"{i['key']:<8} [{f['status']['name']}] ({f['issuetype']['name']}) {f['summary']}")


def get_transitions(key):
    return request("GET", f"/issue/{key}/transitions")["transitions"]


def cmd_transitions(args):
    key = normalize_key(args.key)
    for t in get_transitions(key):
        print(f"{t['id']}: {t['name']} → {t['to']['name']}")


def cmd_transition(args):
    key = normalize_key(args.key)
    target = args.status.strip().lower()
    current = request("GET", f"/issue/{key}?fields=status")["fields"]["status"]["name"]
    if current.lower() == target:
        print(f"{key} már „{current}” státuszban van.")
        return
    options = get_transitions(key)
    match = next((t for t in options if t["to"]["name"].lower() == target or t["name"].lower() == target), None)
    if not match:
        names = ", ".join(t["to"]["name"] for t in options)
        sys.exit(f"Nincs „{args.status}” átmenet. Elérhető: {names}")
    request("POST", f"/issue/{key}/transitions", {"transition": {"id": match["id"]}})
    print(f"{key}: {current} → {match['to']['name']}")


def cmd_comment(args):
    key = normalize_key(args.key)
    paragraphs = [
        {"type": "paragraph", "content": [{"type": "text", "text": line}]}
        for line in args.text.split("\n") if line.strip()
    ]
    request("POST", f"/issue/{key}/comment", {"body": {"type": "doc", "version": 1, "content": paragraphs}})
    print(f"Komment hozzáadva: {key}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("show", help="ticket összefoglaló (csak olvas)")
    p.add_argument("key")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("list", help="ticketek listázása (csak olvas)")
    p.add_argument("--jql")
    p.add_argument("--max", type=int, default=30)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("transitions", help="elérhető átmenetek (csak olvas)")
    p.add_argument("key")
    p.set_defaults(func=cmd_transitions)

    p = sub.add_parser("transition", help="státuszváltás a célstátusz neve alapján (ír)")
    p.add_argument("key")
    p.add_argument("status")
    p.set_defaults(func=cmd_transition)

    p = sub.add_parser("comment", help="komment a tickethez (ír)")
    p.add_argument("key")
    p.add_argument("text")
    p.set_defaults(func=cmd_comment)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
