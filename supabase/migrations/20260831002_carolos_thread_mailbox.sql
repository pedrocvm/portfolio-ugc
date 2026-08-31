-- De que caixa veio a conversa.
--
-- Com uma conta só isto era implícito. Com duas, responder a uma marca podia
-- sair pelo endereço errado — e uma marca que escreveu para a conta pessoal
-- receber resposta da profissional é o tipo de detalhe que se nota.
--
-- Fica opcional: as conversas ingeridas antes desta coluna não sabem a origem,
-- e forçar um valor seria inventar.

alter table public.source_thread
  add column if not exists connection_id uuid
    references public.integration_connection (id) on delete set null;

create index if not exists source_thread_connection_idx
  on public.source_thread (connection_id)
  where connection_id is not null;
