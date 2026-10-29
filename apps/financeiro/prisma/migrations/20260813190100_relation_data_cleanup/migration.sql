-- Dados: proponente genérico → PF/PJ; legado OTHER/PARTNER → sem vínculo (remove aresta)
UPDATE "RelatedParty"
SET relation = 'PROPONENT_PF'
WHERE relation = 'PROPONENT'
  AND length(regexp_replace(cgccpf, '[^0-9]', '', 'g')) <= 11;

UPDATE "RelatedParty"
SET relation = 'PROPONENT_PJ'
WHERE relation = 'PROPONENT';

DELETE FROM "RelatedParty"
WHERE relation IN ('OTHER', 'PARTNER');
