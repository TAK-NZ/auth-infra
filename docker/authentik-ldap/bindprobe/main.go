// ldap-bind-probe is the ECS container health check for the Authentik LDAP outpost.
//
// It binds to the outpost on localhost with the same service account (and the same bind DN
// string) that TAK Server uses, and exits 0 only if the bind succeeds.
//
// Why a bind and not `/ldap healthcheck`: the outpost caches every bind result in memory,
// keyed on DN and password, failures included. After an Authentik outage the cached failure
// for the TAK service account is served for as long as the process lives, while the process
// itself looks healthy. A bind through the outpost's own listener sees the same cached result
// TAK Server sees, so a stale refusal turns the container unhealthy and ECS replaces the task.
//
// Configuration (environment):
//
//	LDAP_PROBE_USERNAME  service account name, for example "ldapservice"
//	LDAP_PROBE_PASSWORD  service account password
//	LDAP_PROBE_BASE_DN   LDAP base DN, for example "dc=ldap,dc=tak"
//	LDAP_PROBE_ADDR      host:port of the outpost, default 127.0.0.1:3389
package main

import (
	"fmt"
	"net"
	"os"
	"time"

	ldap "github.com/go-ldap/ldap/v3"
)

const (
	dialTimeout = 5 * time.Second
	opTimeout   = 10 * time.Second
)

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "ldap-bind-probe: "+format+"\n", args...)
	os.Exit(1)
}

func main() {
	username := os.Getenv("LDAP_PROBE_USERNAME")
	password := os.Getenv("LDAP_PROBE_PASSWORD")
	baseDN := os.Getenv("LDAP_PROBE_BASE_DN")
	addr := os.Getenv("LDAP_PROBE_ADDR")
	if addr == "" {
		addr = "127.0.0.1:3389"
	}
	if username == "" || password == "" || baseDN == "" {
		fail("LDAP_PROBE_USERNAME, LDAP_PROBE_PASSWORD and LDAP_PROBE_BASE_DN must be set")
	}

	conn, err := ldap.DialURL("ldap://"+addr, ldap.DialWithDialer(&net.Dialer{Timeout: dialTimeout}))
	if err != nil {
		fail("cannot connect to %s: %v", addr, err)
	}
	defer conn.Close()
	conn.SetTimeout(opTimeout)

	// Must match the DN TAK Server binds with, because the outpost caches per DN string.
	dn := fmt.Sprintf("cn=%s,ou=users,%s", username, baseDN)
	if err := conn.Bind(dn, password); err != nil {
		fail("bind as %q failed: %v", dn, err)
	}
}
