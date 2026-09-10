# syntax=docker/dockerfile:1

# Interim build: the official authentik LDAP outpost with the cached-searcher
# memory-leak fix built in. The outpost's cached (memory) search/bind mode leaks
# the entire directory on every 5-minute refresh, driving the task to its memory
# limit and getting it OOM-killed under normal login traffic. See
# docker/authentik-ldap/patches/README.md for the full write-up.
#
# Stage 1 compiles cmd/ldap from the OFFICIAL goauthentik/authentik source at the
# same release tag we run (version/${AUTHENTIK_VERSION}), with our vendored patch
# applied, using the same Go toolchain image and build flags as upstream's
# lifecycle/container/ldap.Dockerfile at that tag. Stage 2 is the unmodified
# official LDAP image with only /ldap replaced.
#
# This depends only on the official goauthentik release plus a reviewed patch in
# this repo -- no dependency on any third-party fork. Once an upstream release
# ships the fix, delete the patches/ dir and this builder stage and revert to a
# plain: FROM ghcr.io/goauthentik/ldap:${AUTHENTIK_VERSION}

ARG AUTHENTIK_VERSION=2026.8.2

# --- Stage 1: build the patched outpost binary ------------------------------
# Toolchain image + digest match upstream lifecycle/container/ldap.Dockerfile at
# version/2026.8.2. Keep in sync when bumping AUTHENTIK_VERSION.
FROM docker.io/library/golang:1.27-trixie@sha256:6212da3924947f4b6a939df02ea627c13f338f1a41d6c3fcb0dd9d076eef46c4 AS builder

ARG AUTHENTIK_VERSION
ARG AUTHENTIK_REPO=https://github.com/goauthentik/authentik.git

WORKDIR /go/src/goauthentik.io

# Fetch only the release tag we build against (shallow).
RUN git init -q . \
    && git fetch -q --depth 1 "${AUTHENTIK_REPO}" "refs/tags/version/${AUTHENTIK_VERSION}" \
    && git checkout -q FETCH_HEAD

# Apply the vendored memory-searcher fix. Fails the build if it no longer applies
# cleanly (e.g. after an AUTHENTIK_VERSION bump), which is the signal to refresh
# or drop the patch.
COPY patches/ /patches/
RUN git apply --verbose /patches/0001-ldap-memory-searcher-snapshot.patch

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Same flags as upstream's ldap.Dockerfile (FIPS runtime, cgo enabled).
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOFIPS140=latest \
    go build -o /go/ldap ./cmd/ldap

# --- Stage 2: official runtime image with the patched binary ----------------
FROM ghcr.io/goauthentik/ldap:${AUTHENTIK_VERSION}
LABEL org.opencontainers.image.source=https://github.com/tak-nz/auth-infra-ldap
LABEL org.opencontainers.image.description="Authentik LDAP outpost for TAK server auth via LDAP"
LABEL org.opencontainers.image.licenses=MIT

# Record which source the outpost was built from; surfaces in the outpost's
# version string / API user agent (e.g. "2026.8.2+<sha>").
ARG AUTHENTIK_VERSION
ENV GIT_BUILD_HASH=version/${AUTHENTIK_VERSION}+ldap-memory-searcher-fix

COPY --from=builder /go/ldap /ldap
