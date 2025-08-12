import axios from "axios";
import type { CustomerResponse } from "../models/CustomerResponse";

const SIENGE_BASE_URL = process.env.SIENGE_BASE_URL!;
const SIENGE_USER = process.env.SIENGE_USER!;
const SIENGE_PASS = process.env.SIENGE_PASS!;

/**
 * Rota usada (exemplo real): GET {BASE}/customers/search?cpf=000...
 * Ajuste se a sua rota for diferente.
 */
export default async function BuscarClienteSiengeService(
  cpf: string
): Promise<CustomerResponse | { error: string }> {
  try {
    const url = `${SIENGE_BASE_URL}/customers`;
    console.log("ver o o url aqui2 ", url);
    const resp = await axios.get<CustomerResponse>(url, {
      params: { cpf },
      auth: { username: SIENGE_USER, password: SIENGE_PASS },
      validateStatus: () => true
    });

    // Caso a API retorne erro no body:
    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    console.log("ver o resp aqui2 ", resp.data);
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar cliente" };
  }
}
