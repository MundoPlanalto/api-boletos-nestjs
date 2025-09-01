import type { CurrentDebitBalance } from "../models/CurrentDebitBalance";
import { normalizeDoc } from "src/shared/doc.util";
import { axiosSienge } from "src/shared/http";


export default async function BuscarDebitoClienteService(
  doc: string
): Promise<CurrentDebitBalance | { error: string }> {
  try {
    const { key, value } = normalizeDoc(doc);
    const resp = await axiosSienge.get<CurrentDebitBalance>(
      '/current-debit-balance',
      { params: { [key]: value } }
    )

    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar débitos" };
  }
}
