import { revalidatePath } from "next/cache";

export function revalidatePlanning(id?: string) {
  revalidatePath("/planejamento");
  revalidatePath("/planejamento/buscar");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/contratacoes");
  if (id) {
    revalidatePath(`/planejamento/${id}`);
    revalidatePath(`/planejamento/${id}/nf/nova`);
    revalidatePath(`/planejamento/${id}/reservas`);
    revalidatePath(`/planejamento/${id}/importar-produtor`);
  }
}
