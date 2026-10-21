-- Run AFTER you have registered at least one account. Makes that account a verified agent and adds 12 sample listings.
do $$ declare u uuid; i int; p uuid;
 cities text[][] := array[['Lagos','Eti-Osa','Lekki Phase 1'],['FCT (Abuja)','Abuja Municipal','Wuse 2'],['Rivers','Obio-Akpor','GRA Phase 2']];
 purposes text[] := array['rent','sale','shortlet','land'];
begin
  select id into u from profiles order by created_at limit 1;
  if u is null then raise exception 'Register an account first, then run this seed.'; end if;
  update profiles set role = 'agent', verified = true where id = u;
  for i in 1..12 loop
    insert into properties (owner_id, purpose, ptype, title, description, price, price_period, state, lga, area, bedrooms, bathrooms, size_sqm, furnished,
      features, electricity, water, agency_fee_pct, legal_fee_pct, caution_deposit, status, expires_at, lat, lng)
    values (u, purposes[1 + i % 4],
      case purposes[1 + i % 4] when 'land' then 'land_residential' else (array['flat','duplex','terrace','mini_flat'])[1 + i % 4] end,
      'Sample listing ' || i || ' in ' || cities[1 + i % 3][3], 'A well-kept sample property for preview purposes only.',
      case purposes[1 + i % 4] when 'rent' then 1800000 + i * 150000 when 'sale' then 45000000 + i * 3000000 when 'shortlet' then 60000 + i * 5000 else 8000000 + i * 500000 end,
      case purposes[1 + i % 4] when 'rent' then 'year' when 'shortlet' then 'night' else 'once' end,
      cities[1 + i % 3][1], cities[1 + i % 3][2], cities[1 + i % 3][3], 1 + i % 4, 1 + i % 3, 80 + i * 20, i % 2 = 0,
      array['gated_estate','borehole','generator','cctv'], '18-20 hours', 'Borehole',
      case when purposes[1 + i % 4] = 'rent' then 10 else 0 end, case when purposes[1 + i % 4] = 'rent' then 10 else 0 end, case when purposes[1 + i % 4] = 'rent' then 200000 else 0 end,
      'active', now() + interval '60 days', (array[6.43,9.07,4.82])[1 + i % 3] + i * 0.002, (array[3.45,7.49,7.01])[1 + i % 3] + i * 0.002)
    returning id into p;
    if purposes[1 + i % 4] in ('sale','land') then insert into property_documents (property_id, doc_type, state) values (p, 'c_of_o', 'verified'), (p, 'survey_plan', 'declared'); end if;
  end loop;
end $$;
