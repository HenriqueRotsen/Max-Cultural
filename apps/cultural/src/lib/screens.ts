/**
 * Compat: telas/capacidades do hub.
 * Fonte de verdade: @max/auth ACCESS_CATALOG.
 */
export {
  ACCESS_CATALOG,
  ACCESS_PERMISSION_IDS as SCREEN_IDS,
  ACCESS_BY_ID,
  type AccessPermissionId as ScreenId,
} from "@max/auth";

import { ACCESS_CATALOG, type AccessCatalogEntry } from "@max/auth";

/** Lista plana para seeds/UI legada (todos os IDs do catálogo). */
export const SCREENS = (ACCESS_CATALOG as readonly AccessCatalogEntry[]).map((e) => ({
  id: e.id,
  label: e.label,
  group: e.group,
  kind: e.kind,
  parentId: e.parentId,
  description: e.description,
  product: e.product,
}));
