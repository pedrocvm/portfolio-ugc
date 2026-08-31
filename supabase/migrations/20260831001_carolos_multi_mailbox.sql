-- Duas caixas, não uma.
--
-- A unicidade estava em (provider, app_user_id), o que dizia «uma conta de
-- Gmail por pessoa». A Carol tem a caixa pessoal e a profissional, e as marcas
-- escrevem para as duas: com esta chave, ligar a segunda sobrepunha a primeira
-- em silêncio, porque o upsert dava conflito na mesma linha.
--
-- Não destrutivo: a chave nova é mais permissiva do que a antiga, portanto
-- nenhuma linha existente pode violá-la.

alter table public.integration_connection
  drop constraint if exists integration_connection_provider_app_user_id_key;

alter table public.integration_connection
  add constraint integration_connection_provider_user_account_key
  unique (provider, app_user_id, account_identifier);

-- A sincronização passa a correr uma vez por caixa. Sem a caixa no índice, as
-- listagens por utilizador varriam a tabela toda a cada corrida.
create index if not exists integration_connection_provider_user_idx
  on public.integration_connection (provider, app_user_id)
  where status <> 'revoked';
