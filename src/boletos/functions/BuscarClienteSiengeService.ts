import axios from "axios";
import type { CustomerResponse } from "../models/CustomerResponse";
import { normalizeDoc } from "src/shared/doc.util";

const SIENGE_BASE_URL = process.env.SIENGE_BASE_URL!;
const SIENGE_USER = process.env.SIENGE_USER!;
const SIENGE_PASS = process.env.SIENGE_PASS!;

export default async function BuscarClienteSiengeService(
  doc: string
): Promise<CustomerResponse | { error: string }> {
  try {
    const { key, value } = normalizeDoc(doc);
    const url = `${SIENGE_BASE_URL}/customers`;
    const resp = await axios.get<CustomerResponse>(url, {
      params: { [key]: value },
      auth: { username: SIENGE_USER, password: SIENGE_PASS },
      validateStatus: () => true
    });

    // Caso a API retorne erro no body:
    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar cliente" };
  }
}
