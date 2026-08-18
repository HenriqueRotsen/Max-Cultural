-- Vínculo on/off observado × proponente × IN
CREATE TABLE IF NOT EXISTS "ObservadoBond" (
    "id" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "salicAccountId" TEXT NOT NULL,

    CONSTRAINT "ObservadoBond_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ObservadoBond_salicAccountId_cgccpf_rulesetVersion_key"
  ON "ObservadoBond"("salicAccountId", "cgccpf", "rulesetVersion");
CREATE INDEX IF NOT EXISTS "ObservadoBond_workspaceId_idx" ON "ObservadoBond"("workspaceId");
CREATE INDEX IF NOT EXISTS "ObservadoBond_cgccpf_idx" ON "ObservadoBond"("cgccpf");
CREATE INDEX IF NOT EXISTS "ObservadoBond_rulesetVersion_idx" ON "ObservadoBond"("rulesetVersion");

ALTER TABLE "ObservadoBond"
  ADD CONSTRAINT "ObservadoBond_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservadoBond"
  ADD CONSTRAINT "ObservadoBond_salicAccountId_fkey"
  FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migração best-effort: RelatedParty que gerava vínculo (exceto mapa) → ObservadoBond
-- para todas as INs do catálogo em que a kind entra no art. 23.
-- Kinds que geram vínculo nas INs amplas / estreitas.
INSERT INTO "ObservadoBond" (
  "id", "cgccpf", "rulesetVersion", "enabled", "createdAt", "updatedAt",
  "workspaceId", "salicAccountId"
)
SELECT
  md5(rp."salicAccountId" || ':' || regexp_replace(rp."cgccpf", '\D', '', 'g') || ':' || v.version),
  regexp_replace(rp."cgccpf", '\D', '', 'g'),
  v.version,
  true,
  NOW(),
  NOW(),
  a."workspaceId",
  rp."salicAccountId"
FROM "RelatedParty" rp
JOIN "SalicAccount" a ON a."id" = rp."salicAccountId"
CROSS JOIN (
  VALUES
    ('in-1-2012'),
    ('in-01-2013'),
    ('in-01-2017'),
    ('in-5-2017'),
    ('in-2-2019'),
    ('in-secult-1-2022'),
    ('in-secult-3-2022'),
    ('in-minc-1-2023'),
    ('in-minc-11-2024'),
    ('in-minc-23-2025'),
    ('in-minc-29-2026')
) AS v(version)
WHERE rp."countsTowardProponentCap" = true
  AND COALESCE(rp."notes", '') NOT LIKE '%mapa-societario%'
  AND rp."relation" IN (
    'SPOUSE', 'COMPANION', 'LINEAL_KIN', 'COLLATERAL_2ND', 'AFFINITY',
    'AFFILIATED_COMPANY', 'COMMON_PARTNER', 'COUPLE_PARTNERS', 'CORPORATE_MEMBER'
  )
  AND length(regexp_replace(rp."cgccpf", '\D', '', 'g')) IN (11, 14)
ON CONFLICT ("salicAccountId", "cgccpf", "rulesetVersion") DO NOTHING;
