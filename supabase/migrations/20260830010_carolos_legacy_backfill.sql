-- CarolOS 010 | legacy backfill. Idempotent, additive, non-destructive.
--
-- Every existing brand row keeps its id, name, notes and timestamps. What this
-- adds is the structure the old model could not express: a brand identity, a
-- contact when an actual address exists, one opportunity carrying the legacy
-- stage, and an event trail that says the history was imported rather than
-- observed.
--
-- Deliberately NOT done here:
--   * no contact is invented from a bare first name;
--   * brand.domain is not derived from an email domain, because the address may
--     belong to an agency rather than the brand (socialmedia@feeling.pt);
--   * no action_item rows: the planner in TypeScript owns that, so the rules
--     stay testable. The legacy next_step lands in opportunity.next_action_text.

create or replace function public.carolos_normalize(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           lower(translate(coalesce(v, ''),
             'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÑñÇç',
             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc')),
           '[^a-z0-9]+', '', 'g')
$$;

update public.brand
set normalized_name = public.carolos_normalize(name)
where normalized_name is distinct from public.carolos_normalize(name);

update public.brand set last_activity_at = updated_at where last_activity_at is null;
update public.brand set source = 'legacy_dashboard' where source is null;

-- Instagram handle observed on the legacy record becomes a verified identity.
insert into public.brand_identity (brand_id, provider, external_id, is_primary, verified)
select b.id, 'instagram', lower(regexp_replace(b.instagram, '^@', '')), true, true
from public.brand b
where coalesce(b.instagram, '') <> ''
on conflict (provider, external_id) do nothing;

-- Contacts: only where a real address exists. "Gabriel" alone stays in the
-- legacy contact string; a person record with no way to reach them is noise.
with parsed as (
  select
    b.id as brand_id,
    trim(both from addr) as email,
    -- "Ferino Hendry (Marketing Coordinator) - ferino.hendry@orbitkey.com"
    nullif(trim(both from split_part(split_part(b.contact, '(', 1), '—', 1)), '') as maybe_name,
    nullif(trim(both from split_part(split_part(b.contact, '(', 2), ')', 1)), '') as maybe_role
  from public.brand b
  cross join lateral unnest(
    array(select m[1] from regexp_matches(b.contact, '[\w.+-]+@[\w-]+\.[\w.-]+', 'g') m)
  ) as addr
)
insert into public.contact (brand_id, name, role, email, preferred_channel, source)
select
  p.brand_id,
  case when p.maybe_name ~ '@' then '' else coalesce(p.maybe_name, '') end,
  coalesce(p.maybe_role, ''),
  lower(p.email),
  'email',
  'legacy_dashboard'
from parsed p
on conflict (lower(email)) where email is not null do nothing;

-- The email domain is evidence of a channel, not proof of the brand's website.
insert into public.brand_identity (brand_id, provider, external_id, is_primary, verified)
select distinct c.brand_id, 'email_domain', lower(split_part(c.email, '@', 2)), false, false
from public.contact c
where c.email is not null
  and lower(split_part(c.email, '@', 2)) not in
      ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com')
on conflict (provider, external_id) do nothing;

-- One opportunity per legacy brand, carrying the mapped stage.
insert into public.opportunity (
  brand_id, primary_contact_id, title, stage, source, priority,
  next_action_text, last_activity_at, legacy_brand_stage,
  won_at, lost_at, loss_reason, created_at, updated_at
)
select
  b.id,
  (select c.id from public.contact c where c.brand_id = b.id order by c.created_at limit 1),
  b.name,
  case b.stage
    when 'abordada'   then 'outreach'
    when 'respondeu'  then 'replied'
    when 'proposta'   then 'proposal'
    when 'negociacao' then 'negotiation'
    when 'fechada'    then 'won'
    when 'perdida'    then 'lost'
    else 'discovered'
  end,
  'legacy_dashboard',
  'B',
  coalesce(b.next_step, ''),
  b.updated_at,
  b.stage,
  case when b.stage = 'fechada'  then b.updated_at end,
  case when b.stage = 'perdida'  then b.updated_at end,
  case when b.stage = 'perdida'  then 'unknown_legacy' end,
  b.created_at,
  b.updated_at
from public.brand b
where not exists (
  select 1 from public.opportunity o where o.brand_id = b.id and o.source = 'legacy_dashboard'
);

-- Import event: the original snapshot, kept verbatim so nothing is lost.
insert into public.activity_event (
  event_type, occurred_at, brand_id, opportunity_id, actor_type, channel, summary, payload, dedupe_key
)
select
  'legacy.imported',
  b.created_at,
  b.id,
  o.id,
  'system',
  b.channel,
  format('Ficha antiga importada: %s', b.name),
  jsonb_build_object(
    'legacy_stage', b.stage,
    'legacy_channel', b.channel,
    'legacy_contact', b.contact,
    'legacy_instagram', b.instagram,
    'legacy_next_step', b.next_step,
    'legacy_notes', b.notes,
    'legacy_approached_on', b.approached_on
  ),
  'legacy:brand:' || b.id::text || ':imported'
from public.brand b
join public.opportunity o on o.brand_id = b.id and o.source = 'legacy_dashboard'
on conflict (dedupe_key) do nothing;

-- Approximate outreach. Marked as imported: the date is real, the content is not.
insert into public.activity_event (
  event_type, occurred_at, brand_id, opportunity_id, actor_type, channel, summary, payload, confidence, dedupe_key
)
select
  'outreach.sent',
  b.approached_on::timestamptz,
  b.id,
  o.id,
  'carol',
  b.channel,
  'Abordagem registada na ficha antiga (data real, conteúdo não recuperado).',
  jsonb_build_object('imported', true, 'content_recovered', false),
  0.5,
  'legacy:brand:' || b.id::text || ':outreach'
from public.brand b
join public.opportunity o on o.brand_id = b.id and o.source = 'legacy_dashboard'
where b.approached_on is not null
on conflict (dedupe_key) do nothing;

-- Terminal events so the timeline explains why the stage is what it is.
insert into public.activity_event (
  event_type, occurred_at, brand_id, opportunity_id, actor_type, summary, payload, dedupe_key
)
select
  case when b.stage = 'fechada' then 'opportunity.won' else 'opportunity.lost' end,
  b.updated_at,
  b.id,
  o.id,
  'system',
  case when b.stage = 'fechada'
    then 'Fecho registado na ficha antiga.'
    else 'Perda registada na ficha antiga; motivo não documentado.' end,
  jsonb_build_object('imported', true,
    'reason', case when b.stage = 'perdida' then 'unknown_legacy' else null end),
  'legacy:brand:' || b.id::text || ':' || b.stage
from public.brand b
join public.opportunity o on o.brand_id = b.id and o.source = 'legacy_dashboard'
where b.stage in ('fechada', 'perdida')
on conflict (dedupe_key) do nothing;

-- Relationship snapshots for every brand that now exists.
insert into public.relationship (brand_id, first_contact_at, last_interaction_at, opportunities_count, won_count, lost_count)
select
  b.id,
  b.created_at,
  b.updated_at,
  count(o.id),
  count(o.id) filter (where o.stage = 'won'),
  count(o.id) filter (where o.stage = 'lost')
from public.brand b
left join public.opportunity o on o.brand_id = b.id
group by b.id, b.created_at, b.updated_at
on conflict (brand_id) do nothing;

-- Documents: link only on an exact normalized-name match against exactly one
-- brand. Anything fuzzier becomes a reviewable candidate, never a silent link.
with doc_names as (
  select
    d.id,
    public.carolos_normalize(
      coalesce(d.data ->> 'brand', d.data ->> 'clientName', '')
    ) as norm
  from public.document d
  where d.brand_id is null
),
matched as (
  select dn.id, min(b.id::text)::uuid as brand_id, count(*) as hits
  from doc_names dn
  join public.brand b on b.normalized_name = dn.norm
  where dn.norm <> ''
  group by dn.id
)
update public.document d
set brand_id = m.brand_id, link_confidence = 1.0, link_source = 'exact_match'
from matched m
where d.id = m.id and m.hits = 1;
