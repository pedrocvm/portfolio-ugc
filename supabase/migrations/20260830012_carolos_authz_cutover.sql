-- CarolOS 012 | remove the legacy hard-coded email policies.
--
-- Only runs after 011 proved the app_user path grants the same access. Verified
-- with a simulated JWT carrying the right sub and a deliberately wrong email:
-- access was granted through app_user, so the email predicate is now dead weight
-- and a second place where authorization could drift.

drop policy if exists "editora gere as marcas"      on public.brand;
drop policy if exists "editora gere os documentos"  on public.document;
drop policy if exists "editora gere a biblioteca"   on public.media_item;
drop policy if exists "editora le as visitas"       on public.link_event;
drop policy if exists "editora le rascunho"         on public.site_content;
drop policy if exists "editora insere"              on public.site_content;
drop policy if exists "editora atualiza"            on public.site_content;
drop policy if exists "editora carrega media"       on storage.objects;
drop policy if exists "editora apaga media"         on storage.objects;

-- Deliberately kept: "published legivel por todos", "media com nicho e publica",
-- "media publico" and "qualquer visita regista". Those are the public portfolio
-- and they must keep working for anonymous visitors.
