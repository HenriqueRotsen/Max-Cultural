import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { hasScopeAccess, resolveDataScope } from "@/lib/data-scope";

/**
 * Acesso à prestação de contas de um projeto (rotas de arquivo e relatório):
 * precisa de `prestacao:read` e do projeto dentro do escopo de dados.
 * `escrever` exige poder preencher alguma parte (Produção, Comunicação ou Gestão).
 */
export async function acessoPrestacaoProjeto(projetoId: string, opts: { escrever?: boolean; gestao?: boolean } = {}) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return { erro: "Não autenticado.", status: 401 } as const;
  }
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("prestacao:read")) return { erro: "Sem acesso à prestação de contas.", status: 403 } as const;
  const escreve = perms.has("prestacao:producao") || perms.has("prestacao:comunicacao") || perms.has("prestacao:gestao");
  if (opts.escrever && !escreve) return { erro: "Sem permissão para enviar arquivos.", status: 403 } as const;
  if (opts.gestao && !perms.has("prestacao:gestao")) return { erro: "Só a gestão da prestação de contas.", status: 403 } as const;
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, contextoId: true } });
  if (!projeto) return { erro: "Projeto não encontrado.", status: 404 } as const;
  const scope = await resolveDataScope(user.id);
  if (!hasScopeAccess(scope, { contextoId: projeto.contextoId, idProjeto: projeto.id })) {
    return { erro: "Fora do seu acesso.", status: 403 } as const;
  }
  return { user, perms } as const;
}
