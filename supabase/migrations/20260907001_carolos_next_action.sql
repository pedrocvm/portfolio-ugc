-- CarolOS · Next Best Action
--
-- A leitura de uma conversa deixava a Carol com «Responder à mensagem» quando
-- a marca tinha dito, por escrito, «fale com marketing@empresa.com». A ação
-- certa não é uma resposta: é um email novo, para outra pessoa, com o contexto
-- da conversa — e o sistema já tinha tudo para o preparar.
--
-- Três coisas ficam a existir na base:
--
-- 1. `thread_intel.next_action` — o contrato estruturado da próxima ação de
--    uma conversa, calculado por uma função só. É daqui que o Hoje, a Inbox e
--    a Marca leem. Um `action_item` é uma projeção disto, nunca outra opinião.
-- 2. Proveniência de contato: um endereço que a marca indicou guarda a
--    mensagem em que o disse. «Por que estou mandando para marketing@?» tem
--    resposta clicável.
-- 3. Ligação entre conversas: o email novo nasce numa thread nova do Gmail,
--    e essa thread sabe de onde veio.

alter table public.thread_intel
  add column if not exists next_action      jsonb not null default '{}'::jsonb,
  add column if not exists next_action_type text;

create index if not exists thread_intel_next_action_idx
  on public.thread_intel (next_action_type)
  where next_action_type is not null;

alter table public.contact
  add column if not exists source_message_id uuid references public.source_message (id) on delete set null,
  add column if not exists source_thread_id  uuid references public.source_thread (id) on delete set null,
  add column if not exists source_confidence numeric(4, 3),
  add column if not exists observed_at       timestamptz,
  -- Uma frase, para a tela: «indicado por parcerias@cora.com.br a 04/09».
  add column if not exists provenance        text not null default '';

alter table public.source_thread
  add column if not exists parent_thread_id    uuid references public.source_thread (id) on delete set null,
  add column if not exists referral_message_id uuid references public.source_message (id) on delete set null;

create index if not exists source_thread_parent_idx
  on public.source_thread (parent_thread_id)
  where parent_thread_id is not null;

alter table public.action_item
  add column if not exists next_action      jsonb not null default '{}'::jsonb,
  add column if not exists source_thread_id uuid references public.source_thread (id) on delete set null;

-- Os tipos novos de ação. A lista antiga fica; estes entram ao lado.
alter table public.action_item drop constraint if exists action_item_type_check;
alter table public.action_item
  add constraint action_item_type_check
  check (type in (
    'respond', 'follow_up', 'send_portfolio', 'ask_scope', 'send_rate',
    'negotiate', 'create_proposal', 'start_production', 'request_brief',
    'deliver', 'request_metrics', 'upsell', 'renew_rights', 'nurture',
    'close', 'review', 'wait_expired', 'integration_fix', 'chase_payment',
    'content_map_story', 'content_develop_story', 'content_record_ready',
    'content_confirm_trial', 'content_save_event', 'content_review_signal',
    'content_link_media',
    'compose_to_new_contact', 'confirm_referral', 'schedule_call',
    'ask_usage_rights', 'ask_budget', 'acknowledge_brief',
    'request_shipping_info', 'provide_shipping_info', 'confirm_delivery',
    'wait_until_date', 'no_action_required'
  ));
