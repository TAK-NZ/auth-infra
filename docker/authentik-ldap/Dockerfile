ARG AUTHENTIK_VERSION=2026.8.7

# Health-check probe: binds to the outpost as the TAK service account (see bindprobe/main.go).
# The outpost image is distroless (no shell, no ldap tools), so the probe is a static binary.
FROM golang:1.25-alpine AS bindprobe
WORKDIR /src
COPY bindprobe/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ldap-bind-probe .

FROM ghcr.io/goauthentik/ldap:${AUTHENTIK_VERSION}
LABEL org.opencontainers.image.source=https://github.com/tak-nz/auth-infra-ldap
LABEL org.opencontainers.image.description="Authentik LDAP outpost for TAK server auth via LDAP"
LABEL org.opencontainers.image.licenses=MIT
COPY --from=bindprobe /out/ldap-bind-probe /ldap-bind-probe
