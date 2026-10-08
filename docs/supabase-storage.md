# Supabase Storage — documentos e capas

Os arquivos do MAX passam a ser gravados no **Supabase Storage** (plano Pro: 100 GB inclusos).

## Buckets

| Bucket | Visibilidade | Uso |
|--------|--------------|-----|
| `max-docs` | **privado** | NF, RPA, comprovantes de pagamento, merges SALIC (Origem) |
| `max-public` | **público** | Capas de formulários (Fluxo) |

Os buckets são criados automaticamente no primeiro upload (service role), ou rode:

```bash
cd apps/origem && npx tsx scripts/ensure-storage-buckets.ts
```

## Variáveis (Origem + Fluxo)

Já usadas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Opcionais:

| Var | Default | Nota |
|-----|---------|------|
| `SUPABASE_STORAGE_BUCKET_DOCS` | `max-docs` | Documentos privados |
| `SUPABASE_STORAGE_BUCKET_PUBLIC` | `max-public` | Capas / assets públicos |
| `STORAGE_DRIVER` | auto | `supabase` \| `local` (força disco em dev) |

## Compressão

- **PDF (NF/RPA/comprovante):** Ghostscript `-dPDFSETTINGS=/ebook` quando `gs` está instalado (legível e mais leve). Sem `gs` (ex.: alguns runtimes serverless), grava o PDF original.
- **XML/texto:** gzip se reduzir tamanho.
- **Imagens de capa:** sem recompressão (máx. 5 MB) para manter definição.
- **Fotos de comprovante:** sem recompressão agressiva.

## Paths no banco

`PlanningDocument.storagePath` pode ser:

- `sb://max-docs/planning/{workspaceId}/…` (novo)
- path absoluto local legado (`/…/uploads/planning/…`) — ainda lido

Capas no Fluxo gravam a **URL pública** `https://…supabase.co/storage/v1/object/public/max-public/…`.
