"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { PermissionEffect } from "@prisma/client";
import {
  createUserAction,
  deactivateUserAction,
  deleteUserAction,
  reactivateUserAction,
  updateUserAction,
} from "@/app/actions/acesso";
import {
  emptyScopeMap,
  hydrateScopeMap,
  scopeMapToEntries,
  UserScopeMatrix,
  type ScopeAccessMap,
} from "@/components/admin/user-scope-matrix";
import { accessToDb } from "@/lib/data-scope-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Bootstrap = Awaited<
  ReturnType<typeof import("@/app/actions/acesso").listAccessBootstrapAction>
>;

type UserRow = Bootstrap["users"][number];

function foldSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function UsuariosManager({ data }: { data: Bootstrap }) {
  const [users, setUsers] = useState(data.users);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUsers(data.users);
  }, [data.users]);

  const [edit, setEdit] = useState<UserRow | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();
  const [createdCreds, setCreatedCreds] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [loginFilter, setLoginFilter] = useState("all");

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
    email: "",
    roleId: data.roles[0]?.id ?? "",
    dataScopeMode: "LIMITED" as "ALL" | "LIMITED",
    scopeMap: emptyScopeMap(tree),
    overrides: [] as Array<{ permissionId: string; effect: PermissionEffect }>,
  });

  const roleItems = useMemo(
    () => Object.fromEntries(data.roles.map((r) => [r.id, r.name])),
    [data.roles],
  );

  const selectedRole = data.roles.find((r) => r.id === form.roleId);
  const isAdminRole = selectedRole?.name === "Administrador";
  const editingSuperadmin = Boolean(edit?.isSuperAdmin);
  const effectiveScopeMode =
    editingSuperadmin || isAdminRole ? "ALL" : form.dataScopeMode;
  const totalSteps =
    editingSuperadmin || effectiveScopeMode === "ALL" ? 1 : 2;

  const filteredUsers = useMemo(() => {
    const q = foldSearch(query.trim());
    return users.filter((u) => {
      if (q) {
        const hay = foldSearch(
          `${u.name} ${u.email} ${u.roleName}`,
        );
        if (!hay.includes(q)) return false;
      }
      if (roleFilter === "superadmin") {
        if (!u.isSuperAdmin) return false;
      } else if (roleFilter !== "all") {
        if (u.isSuperAdmin || u.roleId !== roleFilter) return false;
      }
      if (statusFilter === "active" && u.deactivatedAt) return false;
      if (statusFilter === "deactivated" && !u.deactivatedAt) return false;
      if (scopeFilter === "ALL") {
        if (!(u.isSuperAdmin || u.dataScopeMode === "ALL")) return false;
      }
      if (scopeFilter === "LIMITED") {
        if (u.isSuperAdmin || u.dataScopeMode !== "LIMITED") return false;
      }
      if (loginFilter === "never" && u.lastLoginAt) return false;
      if (loginFilter === "logged" && !u.lastLoginAt) return false;
      return true;
    });
  }, [
    users,
    query,
    roleFilter,
    statusFilter,
    scopeFilter,
    loginFilter,
  ]);

  const activeFilterCount = [
    roleFilter !== "all",
    statusFilter !== "all",
    scopeFilter !== "all",
    loginFilter !== "all",
  ].filter(Boolean).length;

  const roleFilterItems = useMemo(
    () =>
      Object.fromEntries([
        ["all", "Todos os papéis"],
        ["superadmin", "Superadmin"],
        ...data.roles.map((r) => [r.id, r.name]),
      ]),
    [data.roles],
  );

  function applyRole(roleId: string) {
    const role = data.roles.find((r) => r.id === roleId);
    const mode =
      role?.name === "Administrador"
        ? "ALL"
        : (role?.dataScopeMode ?? "LIMITED");
    setForm((f) => ({
      ...f,
      roleId,
      dataScopeMode: mode,
      scopeMap:
        mode === "LIMITED" && role?.scopes?.length
          ? hydrateScopeMap(
              tree,
              role.scopes.map((s) => ({
                kind: s.kind,
                resourceId: s.resourceId,
                access: s.access,
              })),
            )
          : mode === "LIMITED"
            ? emptyScopeMap(tree)
            : f.scopeMap,
    }));
    if (mode === "ALL") setStep(1);
  }

  function openCreate() {
    setEdit(null);
    setStep(1);
    setForm({
      name: "",
      email: "",
      roleId: data.roles.find((r) => r.name === "Operador")?.id ?? data.roles[0]?.id ?? "",
      dataScopeMode: "LIMITED",
      scopeMap: emptyScopeMap(tree),
      overrides: [],
    });
    setOpen(true);
  }

  function openEdit(u: UserRow) {
    setEdit(u);
    setStep(1);
    setForm({
      name: u.name,
      email: u.email,
      roleId: u.roleId,
      dataScopeMode: u.dataScopeMode,
      scopeMap: hydrateScopeMap(
        tree,
        u.scopes.map((s) => ({
          kind: s.kind,
          resourceId: s.resourceId,
          access: s.access,
        })),
      ),
      overrides: u.overrides.map((o) => ({
        permissionId: o.permissionId,
        effect: o.effect,
      })),
    });
    setOpen(true);
  }

  function toggleOverride(
    permissionId: string,
    effect: PermissionEffect | null,
  ) {
    setForm((f) => {
      const without = f.overrides.filter((o) => o.permissionId !== permissionId);
      if (!effect) return { ...f, overrides: without };
      return { ...f, overrides: [...without, { permissionId, effect }] };
    });
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Senha copiada");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  function canGoStep2() {
    if (!form.name.trim()) return false;
    if (!edit && !form.email.trim()) return false;
    if (!form.roleId) return false;
    return true;
  }

  function save() {
    startTransition(async () => {
      const scopeMode =
        edit?.isSuperAdmin || isAdminRole ? "ALL" : form.dataScopeMode;
      const scopes =
        scopeMode === "LIMITED" ? scopeMapToEntries(form.scopeMap) : [];
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
      const overrideRows = (edit?.isSuperAdmin ? [] : form.overrides).map(
        (o) => ({
          permissionId: o.permissionId,
          code:
            data.permissions.find((p) => p.id === o.permissionId)?.code ?? "",
          effect: o.effect,
        }),
      );
      const payload = {
        name: form.name,
        roleId: form.roleId,
        dataScopeMode: scopeMode as "ALL" | "LIMITED",
        scopes,
        overrides: edit?.isSuperAdmin ? [] : form.overrides,
      };

      if (edit) {
        const r = await updateUserAction({ id: edit.id, ...payload });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(r.message ?? "OK");
        setUsers((prev) =>
          prev.map((u) =>
            u.id === edit.id
              ? {
                  ...u,
                  name: form.name.trim(),
                  roleId: form.roleId,
                  roleName: edit.isSuperAdmin
                    ? "Superadmin"
                    : (selectedRole?.name ?? u.roleName),
                  dataScopeMode: edit.isSuperAdmin ? "ALL" : scopeMode,
                  scopes: edit.isSuperAdmin ? [] : scopeRows,
                  overrides: edit.isSuperAdmin ? [] : overrideRows,
                }
              : u,
          ),
        );
        setOpen(false);
        return;
      }

      const email = form.email.trim().toLowerCase();
      const r = await createUserAction({ email, ...payload });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      const newUser: UserRow = {
        id: r.userId!,
        email,
        name: form.name.trim(),
        roleId: form.roleId,
        roleName: selectedRole?.name ?? "—",
        isSuperAdmin: false,
        dataScopeMode: scopeMode,
        mustChangePassword: true,
        totpEnabled: false,
        deactivatedAt: null,
        lastLoginAt: null,
        overrides: overrideRows,
        scopes: scopeRows,
      };
      setUsers((prev) =>
        [...prev, newUser].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
      );
      if (r.provisionalPassword) {
        setCopied(false);
        setCreatedCreds({
          name: form.name.trim(),
          email,
          password: r.provisionalPassword,
        });
        toast.success("Usuário criado");
      } else {
        toast.success(r.message ?? "Usuário criado");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand/10 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="users-q">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="users-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, e-mail ou papel"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filtros
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
            {activeFilterCount > 0 || query ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                  setScopeFilter("all");
                  setLoginFilter("all");
                }}
              >
                Limpar
              </Button>
            ) : null}
            <Button type="button" onClick={openCreate}>
              Novo usuário
            </Button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Papel</Label>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v ?? "all")}
                items={roleFilterItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os papéis</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                  {data.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v ?? "all")}
                items={{
                  all: "Todos",
                  active: "Ativos",
                  deactivated: "Desativados",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="deactivated">Desativados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acesso aos dados</Label>
              <Select
                value={scopeFilter}
                onValueChange={(v) => setScopeFilter(v ?? "all")}
                items={{
                  all: "Todos",
                  ALL: "Acesso completo",
                  LIMITED: "Por projeto",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ALL">Acesso completo</SelectItem>
                  <SelectItem value="LIMITED">Por projeto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Login</Label>
              <Select
                value={loginFilter}
                onValueChange={(v) => setLoginFilter(v ?? "all")}
                items={{
                  all: "Todos",
                  logged: "Já logaram",
                  never: "Nunca logaram",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="logged">Já logaram</SelectItem>
                  <SelectItem value="never">Nunca logaram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredUsers.length} de {users.length} usuário(s)
          {activeFilterCount || query ? " (filtrado)" : ""}. Exclusão só se
          nunca tiver entrado.
        </p>
      </div>

      <ul className="divide-y rounded-xl border bg-white/90">
        {filteredUsers.map((u) => (
          <li
            key={u.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium text-brand-deep">
                {u.name}{" "}
                {u.isSuperAdmin ? (
                  <span className="text-xs font-normal text-brand">
                    (superadmin)
                  </span>
                ) : null}
                {u.deactivatedAt ? (
                  <span className="text-xs text-amber-700">(desativado)</span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {u.email} · {u.roleName} ·{" "}
                {u.isSuperAdmin || u.dataScopeMode === "ALL"
                  ? "acesso completo"
                  : "acesso por projeto"}
                {u.lastLoginAt
                  ? ` · último login ${new Date(u.lastLoginAt).toLocaleString("pt-BR")}`
                  : " · nunca logou"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={u.isSuperAdmin && !data.actorIsSuperAdmin}
                onClick={() => openEdit(u)}
              >
                Editar
              </Button>
              {u.deactivatedAt ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await reactivateUserAction(u.id);
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success(r.message);
                        setUsers((prev) =>
                          prev.map((x) =>
                            x.id === u.id
                              ? { ...x, deactivatedAt: null }
                              : x,
                          ),
                        );
                      }
                    })
                  }
                >
                  Reativar
                </Button>
              ) : !u.isSuperAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deactivateUserAction(u.id);
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success(r.message);
                        setUsers((prev) =>
                          prev.map((x) =>
                            x.id === u.id
                              ? {
                                  ...x,
                                  deactivatedAt: new Date().toISOString(),
                                }
                              : x,
                          ),
                        );
                      }
                    })
                  }
                >
                  Desativar
                </Button>
              ) : null}
              {!u.lastLoginAt && !u.isSuperAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deleteUserAction(u.id);
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success(r.message);
                        setUsers((prev) => prev.filter((x) => x.id !== u.id));
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
        {filteredUsers.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado com esses filtros.
          </li>
        ) : null}
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
            <DialogTitle>
              {edit ? "Editar usuário" : "Novo usuário"}
            </DialogTitle>
            <DialogDescription>
              {editingSuperadmin
                ? "Conta privilegiada (superadmin) — não usa papel do sistema; acesso total."
                : totalSteps === 1
                  ? isAdminRole
                    ? "Administrador tem todas as permissões e acesso completo aos dados."
                    : "Dados da conta — acesso completo a todos os dados."
                  : step === 1
                    ? "Etapa 1 de 2 — dados da conta"
                    : "Etapa 2 de 2 — defina o acesso por contexto, projeto e oficina"}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex gap-2">
            <StepPill active={step === 1} label="1. Conta" />
            {!editingSuperadmin && effectiveScopeMode === "LIMITED" ? (
              <StepPill active={step === 2} label="2. Acessos" />
            ) : null}
          </div>

          {step === 1 ? (
            <div className="grid gap-3 py-1">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              {!edit ? (
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={form.email} disabled />
                </div>
              )}
              {editingSuperadmin ? (
                <div className="rounded-lg border border-brand/20 bg-brand-soft/40 px-3 py-2 text-sm text-brand-deep">
                  Superadmin — acesso privilegiado fora dos papéis do sistema.
                  Não é possível alterar papel ou escopo.
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Papel</Label>
                    <Select
                      value={form.roleId}
                      onValueChange={(v) => applyRole(v ?? "")}
                      items={roleItems}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isAdminRole ? (
                      <p className="text-xs text-muted-foreground">
                        O papel Administrador já inclui todas as permissões e
                        acesso total aos dados.
                      </p>
                    ) : null}
                  </div>
                  {!isAdminRole ? (
                    <div className="space-y-1.5">
                      <Label>Acesso aos dados</Label>
                      <Select
                        value={form.dataScopeMode}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            dataScopeMode:
                              (v as "ALL" | "LIMITED") ?? "LIMITED",
                          }))
                        }
                        items={{
                          ALL: "Acesso completo",
                          LIMITED: "Escolher contextos e projetos",
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Como este usuário acessa os dados?" />
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
                        {form.dataScopeMode === "ALL"
                          ? "Não precisa definir contextos na próxima etapa."
                          : "Na próxima etapa você define o que pode ver ou editar."}
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {edit && !editingSuperadmin ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Overrides de permissão</p>
                  <div className="max-h-40 space-y-2 overflow-y-auto text-sm">
                    {data.permissions.map((p) => {
                      const cur = form.overrides.find(
                        (o) => o.permissionId === p.id,
                      )?.effect;
                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>{p.label}</span>
                          <Select
                            value={cur ?? "none"}
                            onValueChange={(v) => {
                              const val =
                                v === "none" ? null : (v as PermissionEffect);
                              toggleOverride(p.id, val);
                            }}
                            items={{
                              none: "Papel",
                              GRANT: "Conceder",
                              DENY: "Negar",
                            }}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Papel</SelectItem>
                              <SelectItem value="GRANT">Conceder</SelectItem>
                              <SelectItem value="DENY">Negar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
              {step === 1 &&
              !editingSuperadmin &&
              effectiveScopeMode === "LIMITED" ? (
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
                  {edit ? "Salvar" : "Criar usuário"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdCreds !== null}
        onOpenChange={(next) => {
          if (!next) setCreatedCreds(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Senha provisória</DialogTitle>
            <DialogDescription>
              Copie e envie ao usuário. Ele deverá trocar a senha no primeiro
              acesso.
            </DialogDescription>
          </DialogHeader>
          {createdCreds ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{createdCreds.name}</p>
                <p className="text-muted-foreground">{createdCreds.email}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="provisional-password">Senha</Label>
                <div className="flex gap-2">
                  <Input
                    id="provisional-password"
                    readOnly
                    value={createdCreds.password}
                    className="font-mono text-base tracking-wide"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => copyPassword(createdCreds.password)}
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setCreatedCreds(null)}
            >
              Fechar
            </Button>
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
