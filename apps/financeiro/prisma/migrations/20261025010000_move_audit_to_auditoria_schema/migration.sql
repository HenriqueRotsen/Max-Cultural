-- Auditoria (antigo Salink) vira app próprio: as tabelas do espelho do SALIC vão
-- para o schema "auditoria" (SET SCHEMA mantém dados, índices e FKs).
-- Proponentes (SalicAccount), Workspace, AppUser e ComplianceRuleset ficam em
-- "origem" (compartilhados); os enums também ficam em "origem".
CREATE SCHEMA IF NOT EXISTS "auditoria";

ALTER TABLE "Project" SET SCHEMA "auditoria";
ALTER TABLE "Payment" SET SCHEMA "auditoria";
ALTER TABLE "Supplier" SET SCHEMA "auditoria";
ALTER TABLE "SyncRun" SET SCHEMA "auditoria";
ALTER TABLE "WatchedSupplier" SET SCHEMA "auditoria";
ALTER TABLE "ObservadoBond" SET SCHEMA "auditoria";
ALTER TABLE "RelatedParty" SET SCHEMA "auditoria";
ALTER TABLE "CorporatePeriod" SET SCHEMA "auditoria";
ALTER TABLE "CorporatePeriodMember" SET SCHEMA "auditoria";
ALTER TABLE "NormDocumentSnapshot" SET SCHEMA "auditoria";
