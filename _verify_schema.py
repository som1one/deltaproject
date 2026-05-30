import psycopg

URL = "postgresql://app:app@127.0.0.1:5435/app"
with psycopg.connect(URL) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT unnest(enum_range(NULL::user_role))::text")
        roles = sorted(r[0] for r in cur.fetchall())
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='upline_blogger_id'"
        )
        has_col = cur.fetchone() is not None
        cur.execute(
            "SELECT to_regclass('public.admin_audit_logs') IS NOT NULL"
        )
        has_tbl = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM users WHERE upline_blogger_id IS NOT NULL"
        )
        backfilled = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM users")
        total_users = cur.fetchone()[0]
print("user_role values:", roles)
print("Tech_Admin in enum:", "Tech_Admin" in roles)
print("users.upline_blogger_id exists:", has_col)
print("admin_audit_logs table exists:", has_tbl)
print(f"users total={total_users}, upline_blogger_id backfilled (non-null)={backfilled}")
