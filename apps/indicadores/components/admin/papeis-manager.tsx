"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleAction,
} from "@/app/actions/acesso";
import {
  emptyScopeMap,
  hydrateScopeMap,
  scopeMapToEntries,
  UserScopeMatrix,
  type ScopeAccessMap,
} from "@/components/admin/user-scope-matrix";
import { accessToDb } from "@/lib/data-scope-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADMIN_ROLE_NAME } from "@/lib/permission-catalog";

type Bootstrap = Awaited<
  ReturnType<typeof import("@/app/actions/acesso").listAccessBootstrapAction>
>;

type RoleRow = Bootstrap["roles"][number];

export function PapeisManager({ data }: { data: Bootstrap }) {
  const [roles, setRoles] = useState(data.roles);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRoles(data.roles);
  }, [data.roles]);

  const tree = useMemo(
    () => ({
      contextos: data.contextos,
      projetos: data.projetos,
      oficinas: data.oficinas,
    }),
    [data.contextos, data.projetos, data.oficinas],
  );

  const [form, setForm] = useState({
    name: "",
    description: "",
    permissionIds: [] as string[],
    dataScopeMode: "LIMITED" as "ALL" | "LIMITED",
    scopeMap: emptyScopeMap(tree),
  });

  const editing = editId
    ? roles.find((r) => r.id === editId) ?? null
    : null;
  const isAdminRole = editing?.name === ADMIN_ROLE_NAME;
  const effectiveScopeMode = isAdminRole ? "ALL" : form.dataScopeMode;
  const totalSteps = effectiveScopeMode === "ALL" ? 1 : 2;

  function openCreate() {
    setEditId(null);
    setStep(1);
    setForm({
      name: "",
      description: "",
      permissionIds: [],
      dataScopeMode: "LIMITED",
      scopeMap: emptyScopeMap(tree),
    });
    setOpen(true);
  }

  function openEdit(r: RoleRow) {
    setEditId(r.id);
    setStep(1);
    const mode =
      r.name === ADMIN_ROLE_NAME ? "ALL" : (r.dataScopeMode ?? "LIMITED");
    setForm({
      name: r.name,
      description: r.description,
      permissionIds: r.permissionIds,
      dataScopeMode: mode,
      scopeMap: hydrateScopeMap(
        tree,
        (r.scopes ?? []).map((s) => ({
          kind: s.kind,
          resourceId: s.resourceId,
          access: s.access,
        })),
      ),
    });
    setOpen(true);
  }

  function togglePerm(id: string, on: boolean) {
    setForm((f) => ({
      ...f,
      permissionIds: on
        ? [...f.permissionIds, id]
        : f.permissionIds.filter((x) => x !== id),
    }));
  }

  function canGoStep2() {
    if (!form.name.trim()) return false;
    return true;
  }

  function save() {
    startTransition(async () => {
      const mode = isAdminRole ? "ALL" : form.dataScopeMode;
      const scopes =
        mode === "LIMITED" ? scopeMapToEntries(form.scopeMap) : [];
      const scopeRows = scopes
        .map((s) => {
          const access = accessToDb(s.access);
          if (!access) return null;
          return {
            kind: s.kind,
            resourceId: s.resourceId,
            access,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      const payload = {
        name: form.name,
        description: form.description,
        permissionIds: form.permissionIds,
        dataScopeMode: mode as "ALL" | "LIMITED",
        scopes,
      };
      const r = editId
        ? await updateRoleAction({ id: editId, ...payload })
        : await createRoleAction(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (editId) {
        setRoles((prev) =>
          prev.map((role) =>
            role.id === editId
              ? {
                  ...role,
                  name: isAdminRole ? role.name : form.name.trim(),
                  description: form.description.trim(),
                  permissionIds: form.permissionIds,
                  dataScopeMode: mode,
                  scopes: mode === "ALL" ? [] : scopeRows,
                }
              : role,
          ),
        );
      } else if (r.roleId) {
        const created: RoleRow = {
          id: r.roleId,
          name: form.name.trim(),
          description: form.description.trim(),
          isSystem: false,
          dataScopeMode: mode,
          usersCount: 0,
          permissionIds: form.permissionIds,
          scopes: mode === "ALL" ? [] : scopeRows,
        };
        setRoles((prev) =>
          [...prev, created].sort((a, b) =>
            a.name.localeCompare(b.name, "pt-BR"),
          ),
        );
      }
      setOpen(false);
    });
  }

  const grouped = data.permissions.reduce<
    Record<string, Bootstrap["permissions"]>
  >((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          Novo papel
        </Button>
      </div>
      <ul className="divide-y rounded-xl border bg-white/90">
        {roles.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium text-brand-deep">
                {r.name}
                {r.isSystem ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    sistema
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.description || "—"} · {r.usersCount} usuário(s) ·{" "}
                {r.permissionIds.length} permissões ·{" "}
                {r.name === ADMIN_ROLE_NAME || r.dataScopeMode === "ALL"
                  ? "acesso completo aos dados"
                  : `${r.scopes?.length ?? 0} escopo(s) de dados`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openEdit(r)}
              >
                Editar
              </Button>
              {!r.isSystem ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteRoleAction(r.id);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success(res.message);
                        setRoles((prev) => prev.filter((x) => x.id !== r.id));
                      }
                    })
                  }
                >
                  Excluir
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setStep(1);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar papel" : "Novo papel"}</DialogTitle>
            <DialogDescription>
              {totalSteps === 1
                ? isAdminRole
                  ? "Administrador: todas as permissões e acesso completo aos dados."
                  : "Dados do papel e permissões — acesso completo aos dados."
                : step === 1
                  ? "Etapa 1 de 2 — permissões de tela e modo de acesso aos dados"
                  : "Etapa 2 de 2 — defina o acesso padrão por contexto, projeto e oficina"}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex gap-2">
            <StepPill active={step === 1} label="1. Papel e permissões" />
            {effectiveScopeMode === "LIMITED" ? (
              <StepPill active={step === 2} label="2. Acessos aos dados" />
            ) : null}
          </div>

          {step === 1 ? (
            <div className="grid gap-3 py-1">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  disabled={Boolean(editing?.isSystem)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>

              {!isAdminRole ? (
                <div className="space-y-1.5">
                  <Label>Acesso padrão aos dados</Label>
                  <Select
                    value={form.dataScopeMode}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        dataScopeMode: (v as "ALL" | "LIMITED") ?? "LIMITED",
                      }))
                    }
                    items={{
                      ALL: "Acesso completo",
                      LIMITED: "Escolher contextos e projetos",
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        Acesso completo — vê e edita tudo
                      </SelectItem>
                      <SelectItem value="LIMITED">
                        Escolher contextos e projetos — libera item a item
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Usuários deste papel herdam esse escopo, a menos que tenham
                    um escopo próprio na ficha do usuário.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-brand/20 bg-brand-soft/40 px-3 py-2 text-sm text-brand-deep">
                  O papel Administrador sempre tem acesso completo aos dados.
                </div>
              )}

              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Permissões de tela e ação</p>
                {Object.entries(grouped).map(([group, perms]) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {group}
                    </p>
                    {perms.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.permissionIds.includes(p.id)}
                          onCheckedChange={(v) =>
                            togglePerm(p.id, v === true)
                          }
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <UserScopeMatrix
              tree={tree}
              value={form.scopeMap}
              onChange={(scopeMap: ScopeAccessMap) =>
                setForm((f) => ({ ...f, scopeMap }))
              }
            />
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {step === 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  Voltar
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step === 1 && effectiveScopeMode === "LIMITED" ? (
                <Button
                  type="button"
                  disabled={!canGoStep2()}
                  onClick={() => setStep(2)}
                >
                  Continuar
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={pending || !canGoStep2()}
                  onClick={save}
                >
                  Salvar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        active
          ? "bg-brand-soft text-brand-deep"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
