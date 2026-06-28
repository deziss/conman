# conman — local stack notes

conman is a **documented exception** to the shared `local_stack/` wiring.

**Why:** conman's real data lives in **CockroachDB** (`conman_crdb_data`, ~1.09 GB)
plus **Zitadel** (`conman_zitadel_data`) and a SQLite app DB (`conman_conman_data`).
CockroachDB is a different engine from the shared PostgreSQL, so its data cannot
be folded into the shared `local_postgres` without an app-level data migration
that would risk the existing data. The IAM stack (Zitadel + Kong) is also heavy.

**Recommended local run:** keep conman on its own compose, in SQLite-simple mode:

```bash
cd conman
docker compose -f docker-compose.simple.yml up --build -d
```

This preserves all existing conman data in place (no migration, nothing destroyed).

**Optional shared integration:** if you want conman to use the shared Kong from
`local_stack` (auth profile) instead of its bundled Kong, attach the conman
backend to the shared network and point it at `kong:8001`. Not required for dev.

conman's Postgres role/db (`conman` / `conman_db`) IS provisioned in the shared
stack for any future migration, but is currently unused.
