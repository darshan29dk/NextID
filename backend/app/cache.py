"""
Tiny in-process TTL cache.

No Redis, no extra service to run - just a dict that lives in the FastAPI
process's memory. Good enough for data that's read constantly (every login)
but changes rarely (menu permissions per role). Since the DB for this app
is a remote MySQL instance (not localhost), every avoided query saves a
real network round trip, which is where most of the perceived slowness
comes from.

NOTE: this only works because the backend runs as a single process. If it's
ever run with multiple worker processes, this cache won't be shared between
them and would need to move to something like Redis.
"""
import time
from threading import Lock

_store = {}
_lock = Lock()


def cache_get(key):
    with _lock:
        entry = _store.get(key)
        if not entry:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del _store[key]
            return None
        return value


def cache_set(key, value, ttl_seconds=300):
    with _lock:
        _store[key] = (value, time.time() + ttl_seconds)


def cache_delete(key):
    with _lock:
        _store.pop(key, None)


def cache_delete_prefix(prefix):
    """Delete every cached key starting with prefix - used to invalidate
    all menu-permission entries for a role in one call."""
    with _lock:
        for key in [k for k in _store if k.startswith(prefix)]:
            del _store[key]


def cache_clear():
    with _lock:
        _store.clear()
