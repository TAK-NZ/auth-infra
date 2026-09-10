# LDAP outpost patches

Patches applied on top of the official `goauthentik/authentik` source when
building the LDAP outpost binary in `../Dockerfile`.

## `0001-ldap-memory-searcher-snapshot.patch`

Fixes a serious memory leak in the LDAP cached (memory) searcher.

**The bug:** the cached searcher stored `&ms.users[i]` on a bind DN's
`UserFlags.UserInfo` the first time a non-searching user searched, and never
cleared it. Each `fetch()` (every ~5 minutes) replaces `ms.users` with a fresh
full copy of the directory, but every stored pointer keeps an entire superseded
copy alive for the life of the process. Each distinct user password-bind after a
restart (every CloudTAK login, enrollment, or web-UI login) pins another
~100-160 MB. The outpost task climbs to its memory limit and is OOM-killed,
roughly daily under normal login traffic.

Our LDAP provider runs in cached search/bind mode, which is exactly the
`MemorySearcher` code path, so we are affected. The buggy file is byte-identical
across `version/2026.8.1` and `version/2026.8.2`.

**The fix:** replace the two mutable slices with an immutable `snapshot`
(users, groups, and a pk->index map) behind an `atomic.Pointer`. `fetch()`
builds a new snapshot and swaps it atomically; `Search()` loads the snapshot
once per request and copies out the bound user's value. The searcher no longer
writes to the per-DN flags, so nothing pins stale snapshots.

**Provenance:** this is the same fix (byte-identical `memory.go`, blob
`6ded5b6f`) proposed upstream in
[goauthentik/authentik#26028](https://github.com/goauthentik/authentik/pull/26028).
We vendor the diff here rather than fetching from a fork so the build depends
only on the official goauthentik release tag plus this reviewed patch, with no
dependency on any third-party fork.

**Applies against:** tag `version/2026.8.2` (verified with `git apply --check`).

**Removal:** once an upstream authentik release ships this fix, delete this
patch and the builder stage in `../Dockerfile`, and revert to a plain
`FROM ghcr.io/goauthentik/ldap:${AUTHENTIK_VERSION}`.
