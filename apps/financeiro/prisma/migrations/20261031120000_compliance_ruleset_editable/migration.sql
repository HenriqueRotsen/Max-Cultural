-- INs editáveis na Auditoria: marca de edição manual e exclusão lógica.
ALTER TABLE "ComplianceRuleset" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "ComplianceRuleset" ADD COLUMN "editedByEmail" TEXT;
ALTER TABLE "ComplianceRuleset" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- IN nº 01/2013 não define limites percentuais.
UPDATE "ComplianceRuleset"
SET "caps" = jsonb_set("caps"::jsonb, '{noPercentLimits}', 'true'::jsonb), "editedAt" = CURRENT_TIMESTAMP
WHERE "version" = 'in-01-2013';
