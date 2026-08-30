-- CarolOS 009 | relational context for the existing document engine.
--
-- The document JSON and its rendering are untouched. What changes is that a
-- proposal, contract or usage authorization can now say which brand, which
-- opportunity and which quote it belongs to, instead of being matched by
-- normalized name at read time.

alter table public.document
  add column if not exists brand_id          uuid references public.brand (id) on delete set null,
  add column if not exists opportunity_id    uuid references public.opportunity (id) on delete set null,
  add column if not exists collaboration_id  uuid references public.collaboration (id) on delete set null,
  add column if not exists quote_id          uuid references public.quote (id) on delete set null,
  add column if not exists status            text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'superseded')),
  add column if not exists version           smallint not null default 1,
  add column if not exists supersedes_document_id uuid references public.document (id) on delete set null,
  add column if not exists link_confidence   real check (link_confidence between 0 and 1),
  add column if not exists link_source       text check (link_source in ('manual', 'exact_match', 'fuzzy_candidate')),
  add column if not exists sent_at           timestamptz,
  add column if not exists accepted_at       timestamptz;

create index if not exists document_brand_idx       on public.document (brand_id);
create index if not exists document_opportunity_idx on public.document (opportunity_id);

alter table public.quote drop constraint if exists quote_document_fk;
alter table public.quote
  add constraint quote_document_fk
  foreign key (document_id) references public.document (id) on delete set null not valid;

alter table public.rights_license drop constraint if exists rights_license_document_fk;
alter table public.rights_license
  add constraint rights_license_document_fk
  foreign key (document_id) references public.document (id) on delete set null not valid;
