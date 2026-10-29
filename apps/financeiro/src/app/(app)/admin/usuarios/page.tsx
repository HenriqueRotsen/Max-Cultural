import { redirect } from "next/navigation";

export default function AdminUsuariosPage() {
  const hub = (process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  redirect(`${hub}/usuarios`);
}
