"use client";

import { useTransition } from "react";
import { toggleCatalogFavorite } from "@/lib/catalog/actions";

export function CatalogFavoriteButton({
  supplierId,
  favorited,
}: {
  supplierId: string;
  favorited: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={pending}
      onClick={() => start(() => toggleCatalogFavorite(supplierId))}
      aria-pressed={favorited}
      title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      {favorited ? "♥ Favorito" : "♡ Favoritar"}
    </button>
  );
}
