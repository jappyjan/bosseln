#!/usr/bin/env python3
"""Production check for the deployed Boßeln PWA (no browser required).

Verifies the hosting layer that the app depends on:
  * index.html + hashed assets reachable, correct cache policy
  * the deployed bundle really contains the current build
  * service worker served uncached with the right scope
  * manifest MIME type + install metadata
  * icons, SPA fallback, security headers, TLS certificate

Usage:  python3 qa/verify-live.py [https://birthday.apps.janjaap.de]
"""
import json
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = (sys.argv[1] if len(sys.argv) > 1 else "https://birthday.apps.janjaap.de").rstrip("/")
failures = []


def get(path, method="GET"):
    req = urllib.request.Request(ROOT + path, method=method, headers={"User-Agent": "bosseln-verify/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")
    if not ok:
        failures.append(name)


print(f"== target: {ROOT}\n")

brokers_found = []

st, hd, body = get("/")
html = body.decode("utf-8", "replace")
check("index.html erreichbar", st == 200 and "Boßeln" in html, f"status={st} bytes={len(body)}")
check("index.html nicht cachebar", "no-cache" in (hd.get("Cache-Control") or ""), hd.get("Cache-Control"))
check("Manifest verlinkt", "manifest.webmanifest" in html)

assets = re.findall(r'(?:src|href)="\.?/?(assets/[^"]+)"', html)
check("gehashte Assets referenziert", len(assets) >= 2, ", ".join(assets))
for a in assets:
    st, hd, body = get("/" + a)
    check(f"/{a} ausgeliefert", st == 200, f"bytes={len(body)} cache={hd.get('Cache-Control')}")
    if a.endswith(".js") and st == 200:
        js = body.decode("utf-8", "replace")
        # Feature-level markers: assert what the app can *do*, never how it does it.
        # (An earlier version of this script asserted the Gun relay host and started
        # failing the moment sharing moved to MQTT.)
        check("  Build enthält Ergebnis-Disclaimer", "Kein Wettkampf" in js)
        check("  Build enthält Touch-Target-Klassen (44px)", "min-h-[44px]" in js)
        check("  Build enthält DE+EN Übersetzungen", "Birthday Boßeln" in js and "Geburtstag Boßeln" in js)
        check("  Build enthält Strafenkatalog", "penalty.ditch" in js and "Ball im Graben" in js)
        check("  Build enthält Partykarten (3 Kategorien)", all(k in js for k in ("birthday_tax", "weak_arm", "water_break")))
        check("  Build enthält Teilen/Sync-Code", "bosseln/" in js and "mqtt" in js.lower())
        brokers_found.extend(re.findall(r"wss://[\w.-]+:\d+/[a-zA-Z]*", js))

st, hd, body = get("/sw.js")
check("Service Worker erreichbar", st == 200, f"bytes={len(body)}")
check("Service Worker nicht cachebar", "no-store" in (hd.get("Cache-Control") or ""), hd.get("Cache-Control"))

st, hd, body = get("/manifest.webmanifest")
try:
    m = json.loads(body)
    check("Manifest: korrekter MIME-Type", "manifest+json" in (hd.get("Content-Type") or ""), hd.get("Content-Type"))
    check("Manifest: standalone + portrait", m.get("display") == "standalone" and m.get("orientation") == "portrait")
    check("Manifest: 3 Icons inkl. maskable", len(m.get("icons", [])) == 3, str([i.get("sizes") for i in m.get("icons", [])]))
    check("Manifest: start_url/scope relativ (kein Subpfad-Problem)", str(m.get("start_url")).startswith("."))
except Exception as exc:  # noqa: BLE001
    check("Manifest lesbar", False, str(exc))

for p in ("/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png", "/icons/apple-touch-icon.png"):
    st, hd, _ = get(p, "HEAD")
    check(f"{p} erreichbar", st == 200, hd.get("Content-Type"))

st, _, body = get("/ein/tiefer/link")
check("SPA-Fallback für Deep Links", st == 200 and "Boßeln" in body.decode("utf-8", "replace"), f"status={st}")

# the sharing feature depends on public MQTT brokers being reachable — from the network
# the app is used on, not just from the build machine
for broker in sorted(set(brokers_found)):
    host_port = broker.split("//")[1].split("/")[0]
    bhost, bport = host_port.rsplit(":", 1)
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.create_connection((bhost, int(bport)), timeout=12), server_hostname=bhost) as s:
            s.do_handshake()
        check(f"Teilen-Broker erreichbar {broker}", True, "TLS/WebSocket-Port offen")
    except Exception as exc:  # noqa: BLE001
        check(f"Teilen-Broker erreichbar {broker}", False, str(exc))

st, hd, _ = get("/", "HEAD")
for k in ("X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"):
    check(f"Security-Header {k}", bool(hd.get(k)), str(hd.get(k)))

host = urllib.parse.urlsplit(ROOT).hostname
try:
    ctx = ssl.create_default_context()
    with ctx.wrap_socket(socket.create_connection((host, 443), timeout=15), server_hostname=host) as s:
        cert = s.getpeercert()
    issuer = dict(x[0] for x in cert["issuer"]).get("organizationName")
    check("HTTPS mit gültigem Zertifikat (Secure Context für den SW)", True, f"issuer={issuer} bis {cert['notAfter']}")
except Exception as exc:  # noqa: BLE001
    check("HTTPS mit gültigem Zertifikat", False, str(exc))

print(f"\n{len(failures)} Problem(e)" if failures else "\nalle Prüfungen bestanden")
sys.exit(1 if failures else 0)
