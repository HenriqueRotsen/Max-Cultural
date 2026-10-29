import { z } from "zod";

export const userContactAddressSchema = z.object({
  contactEmail: z.string().email("Informe um e-mail de contato válido"),
  contactPhone: z
    .string()
    .min(10, "Informe o telefone com DDD")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Informe o telefone com DDD"),
  addressZip: z
    .string()
    .min(8, "Informe o CEP")
    .refine((v) => v.replace(/\D/g, "").length === 8, "CEP deve ter 8 dígitos"),
  addressStreet: z.string().min(2, "Informe o logradouro"),
  addressNumber: z.string().min(1, "Informe o número"),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().min(2, "Informe o bairro"),
  addressCity: z.string().min(2, "Informe a cidade"),
  addressState: z
    .string()
    .length(2, "Informe a UF")
    .transform((v) => v.toUpperCase()),
});

export type UserContactAddressInput = z.infer<typeof userContactAddressSchema>;

export function parseUserContactAddressForm(formData: FormData, fallbackEmail?: string) {
  const contactEmail =
    String(formData.get("contactEmail") || "").trim() || (fallbackEmail || "").trim();
  return userContactAddressSchema.safeParse({
    contactEmail,
    contactPhone: String(formData.get("contactPhone") || "").trim(),
    addressZip: String(formData.get("addressZip") || "").trim(),
    addressStreet: String(formData.get("addressStreet") || "").trim(),
    addressNumber: String(formData.get("addressNumber") || "").trim(),
    addressComplement: String(formData.get("addressComplement") || "").trim() || undefined,
    addressNeighborhood: String(formData.get("addressNeighborhood") || "").trim(),
    addressCity: String(formData.get("addressCity") || "").trim(),
    addressState: String(formData.get("addressState") || "").trim(),
  });
}

export function userContactAddressData(parsed: UserContactAddressInput) {
  return {
    contactEmail: parsed.contactEmail.toLowerCase(),
    contactPhone: parsed.contactPhone.replace(/\D/g, ""),
    addressZip: parsed.addressZip.replace(/\D/g, ""),
    addressStreet: parsed.addressStreet,
    addressNumber: parsed.addressNumber,
    addressComplement: parsed.addressComplement || null,
    addressNeighborhood: parsed.addressNeighborhood,
    addressCity: parsed.addressCity,
    addressState: parsed.addressState,
  };
}
