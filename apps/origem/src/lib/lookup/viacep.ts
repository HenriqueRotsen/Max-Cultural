/** Consulta pública ViaCEP — https://viacep.com.br */

export type ViaCepResult = {
  zip: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export async function fetchViaCep(cepRaw: string): Promise<ViaCepResult | null> {
  const cep = cepRaw.replace(/\D/g, "");
  if (cep.length !== 8) return null;

  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };

  if (data.erro || !data.localidade || !data.uf) return null;

  return {
    zip: cep,
    street: (data.logradouro || "").trim(),
    complement: (data.complemento || "").trim(),
    neighborhood: (data.bairro || "").trim(),
    city: (data.localidade || "").trim(),
    state: (data.uf || "").trim().toUpperCase(),
  };
}
