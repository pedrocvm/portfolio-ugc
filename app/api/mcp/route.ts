import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import {
  MCP_STAGES,
  authenticateCarolMcp,
  createContent,
  createPillar,
  deleteContent,
  getContent,
  listContent,
  listPillars,
  renamePillar,
  updateContent,
} from '@/modules/mcp/carolos';

export const runtime = 'nodejs';
export const maxDuration = 30;

const OAUTH_SCOPES = ['email', 'profile'];
const SECURITY = [{ type: 'oauth2' as const, scopes: OAUTH_SCOPES }];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const stageSchema = z.enum(MCP_STAGES);

function lisbonToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + amount);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function weekRange(value = lisbonToday()) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  const from = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return { from, to: addDays(from, 6) };
}

async function identityFromContext(ctx: { http?: { authInfo?: AuthInfo } }) {
  const token = ctx.http?.authInfo?.token;
  if (!token) throw new Error('Autenticação necessária.');
  const identity = await authenticateCarolMcp(token);
  if (!identity) throw new Error('Sessão inválida ou sem acesso ao CarolOS.');
  return identity;
}

function ok(data: unknown, summary: string) {
  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: { data },
  };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : 'Erro inesperado no CarolOS.';
  return {
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    'profile',
    {
      title: 'Conta conectada',
      description: 'Mostra qual conta do CarolOS está ligada a esta conexão.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      outputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
      }),
      _meta: {
        securitySchemes: SECURITY,
        'openai/profile': true,
      },
    },
    async (_input, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const profile = {
          id: identity.appUser.id,
          name: identity.appUser.displayName,
          email: identity.appUser.email,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(profile) }],
          structuredContent: profile,
        };
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_board_schema',
    {
      title: 'Estrutura do gerenciador',
      description:
        'Lê os pilares atuais e as etapas disponíveis do Kanban antes de criar ou organizar conteúdo.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async (_input, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const pillars = await listPillars(identity.db);
        return ok(
          {
            pillars,
            stages: [
              { value: 'idea', label: 'Ideia' },
              { value: 'script', label: 'Roteiro' },
              { value: 'recording', label: 'Gravar' },
              { value: 'editing', label: 'Editar' },
              { value: 'ready', label: 'Pronto' },
              { value: 'published', label: 'Publicado' },
            ],
          },
          `${pillars.length} pilares ativos e 6 etapas de produção.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_content',
    {
      title: 'Listar conteúdos',
      description:
        'Lê cards do gerenciador de conteúdo. Sem datas, devolve a semana atual em Portugal.',
      inputSchema: z.object({
        from: dateSchema.optional().describe('Data inicial YYYY-MM-DD.'),
        to: dateSchema.optional().describe('Data final YYYY-MM-DD.'),
        stage: stageSchema.optional(),
        pillar_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(250).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ from, to, stage, pillar_id, limit }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const defaults = weekRange();
        const rows = await listContent(identity.db, {
          from: from ?? defaults.from,
          to: to ?? defaults.to,
          stage,
          pillarId: pillar_id,
          limit,
        });
        return ok(rows, `${rows.length} conteúdo(s) encontrado(s).`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_content',
    {
      title: 'Ler conteúdo',
      description: 'Lê um card completo, incluindo pilar, formato, assunto, roteiro, data e etapa.',
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ id }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const row = await getContent(identity.db, id);
        return ok(row, `Conteúdo carregado: ${row.subject}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_content',
    {
      title: 'Criar conteúdo',
      description:
        'Cria um novo card no CarolOS. Use get_board_schema antes para obter pillar_id e etapas válidas.',
      inputSchema: z.object({
        pillar_id: z.string().uuid(),
        format: z.string().max(80).optional(),
        subject: z.string().trim().min(1).max(240),
        script: z.string().max(30000).optional(),
        scheduled_for: dateSchema,
        stage: stageSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ pillar_id, format, subject, script, scheduled_for, stage }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const row = await createContent(identity.db, {
          pillarId: pillar_id,
          format,
          subject,
          script,
          scheduledFor: scheduled_for,
          stage,
        });
        return ok(row, `Conteúdo criado: ${row.subject}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'update_content',
    {
      title: 'Editar conteúdo',
      description:
        'Atualiza qualquer combinação de pilar, formato, assunto, roteiro, data ou etapa de um card existente.',
      inputSchema: z.object({
        id: z.string().uuid(),
        pillar_id: z.string().uuid().optional(),
        format: z.string().max(80).optional(),
        subject: z.string().trim().min(1).max(240).optional(),
        script: z.string().max(30000).optional(),
        scheduled_for: dateSchema.optional(),
        stage: stageSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ id, pillar_id, format, subject, script, scheduled_for, stage }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const row = await updateContent(identity.db, id, {
          pillarId: pillar_id,
          format,
          subject,
          script,
          scheduledFor: scheduled_for,
          stage,
        });
        return ok(row, `Conteúdo atualizado: ${row.subject}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'move_content',
    {
      title: 'Mover conteúdo',
      description:
        'Move rapidamente um card para outra etapa do Kanban e, opcionalmente, para outra data.',
      inputSchema: z.object({
        id: z.string().uuid(),
        stage: stageSchema,
        scheduled_for: dateSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ id, stage, scheduled_for }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const row = await updateContent(identity.db, id, {
          stage,
          scheduledFor: scheduled_for,
        });
        return ok(row, `Conteúdo movido para ${stage}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_content',
    {
      title: 'Excluir conteúdo',
      description: 'Exclui definitivamente um card do gerenciador de conteúdo.',
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ id }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const row = await deleteContent(identity.db, id);
        return ok(row, `Conteúdo excluído: ${row.subject}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_pillar',
    {
      title: 'Criar pilar',
      description: 'Adiciona um novo pilar editorial ao CarolOS.',
      inputSchema: z.object({ name: z.string().trim().min(1).max(80) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ name }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const pillar = await createPillar(identity.db, name);
        return ok(pillar, `Pilar criado: ${pillar.name}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'rename_pillar',
    {
      title: 'Renomear pilar',
      description: 'Altera o nome de um pilar editorial sem quebrar os cards ligados a ele.',
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: SECURITY },
    },
    async ({ id, name }, ctx) => {
      try {
        const identity = await identityFromContext(ctx);
        const pillar = await renamePillar(identity.db, id, name);
        return ok(pillar, `Pilar renomeado para ${pillar.name}.`);
      } catch (error) {
        return fail(error);
      }
    },
  );
}, {
  serverInfo: {
    name: 'CarolOS',
    version: '1.0.0',
  },
});

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  const identity = await authenticateCarolMcp(bearerToken);
  if (!identity) return undefined;

  const rawScope = identity.claims.scope;
  const scopes =
    typeof rawScope === 'string' && rawScope.trim()
      ? rawScope.split(/\s+/)
      : OAUTH_SCOPES;

  return {
    token: bearerToken,
    scopes,
    clientId:
      typeof identity.claims.client_id === 'string'
        ? identity.claims.client_id
        : identity.appUser.id,
    expiresAt:
      typeof identity.claims.exp === 'number'
        ? identity.claims.exp
        : undefined,
    extra: {
      appUserId: identity.appUser.id,
      authUserId: identity.authUser.id,
    },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
  resourceUrl: 'https://carolqueiroz.pt',
});

export { authHandler as GET, authHandler as POST };
