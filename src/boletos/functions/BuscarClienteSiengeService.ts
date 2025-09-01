import type { CustomerResponse } from "../models/CustomerResponse";
import { normalizeDoc } from "src/shared/doc.util";
import { axiosSienge } from "src/shared/http";

export default async function BuscarClienteSiengeService(
  doc: string
): Promise<CustomerResponse | { error: string }> {
  try {
    const { key, value } = normalizeDoc(doc);

    const resp = await axiosSienge.get<CustomerResponse>(
      '/customers',
      { params: { [key]: value } }
    );    

    // Caso a API retorne erro no body:
    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar cliente" };
  }
}
