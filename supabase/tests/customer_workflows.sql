begin;

do $test$
begin
  if has_function_privilege('anon', 'public.save_my_address(text,text,text,text,text,text,text,text,text,boolean,uuid)', 'execute') then
    raise exception 'anonymous callers can save addresses';
  end if;
  if not has_function_privilege('authenticated', 'public.save_my_address(text,text,text,text,text,text,text,text,text,boolean,uuid)', 'execute') then
    raise exception 'authenticated customers cannot save addresses';
  end if;
  if has_function_privilege('anon', 'public.request_my_return(uuid,text,text,jsonb)', 'execute') then
    raise exception 'anonymous callers can request returns';
  end if;
  if has_function_privilege('anon', 'public.submit_verified_review(uuid,uuid,smallint,text,text)', 'execute') then
    raise exception 'anonymous callers can submit verified reviews';
  end if;
end
$test$;

rollback;
