from app.query.parser import parse_selection


def test_flat_and_hinted_embeds():
    selection = parse_selection(
        "*, chemists(business_name, code), profiles!orders_so_id_fkey(full_name, so_code)"
    )
    assert selection.star
    assert selection.embeds[0].key == "chemists"
    assert selection.embeds[0].columns == ["business_name", "code"]
    assert selection.embeds[1].key == "profiles"
    assert selection.embeds[1].hint == "orders_so_id_fkey"
    assert selection.embeds[1].inner is False


def test_inner_and_nested_embeds():
    selection = parse_selection(
        "qty, product_id, products(name), doctor_visits!inner(visit_date, doctor_id, doctors(name), profiles!doctor_visits_so_id_fkey(full_name))"
    )
    assert selection.columns == ["qty", "product_id"]
    visits = selection.embeds[1]
    assert visits.key == "doctor_visits"
    assert visits.inner is True
    assert [item.key for item in visits.embeds] == ["doctors", "profiles"]
    assert visits.embeds[1].hint == "doctor_visits_so_id_fkey"


def test_schema_has_no_supabase_auth():
    from pathlib import Path

    sql = Path("sql/01_schema.sql").read_text(encoding="utf-8")
    assert "auth.users" not in sql
    assert "auth.uid()" not in sql
    assert "storage." not in sql
    assert "public.current_user_id()" in sql
    assert "public.users" in sql
    assert "grant execute on all functions in schema public to biory_app" in sql
    assert "is_demo_email" not in sql
    assert "_setup_demo_user" not in sql
