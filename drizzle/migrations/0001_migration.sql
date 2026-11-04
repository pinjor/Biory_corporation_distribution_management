alter function public.today_bd() set search_path = public;
alter function public.block_mutation() set search_path = public;
revoke execute on function public.audit_row() from authenticated;
revoke execute on function public.apply_stock_movement() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.on_role_granted() from authenticated;
revoke execute on function public.set_party_code() from authenticated;
revoke execute on function public.block_mutation() from authenticated;