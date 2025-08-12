import axios from "axios";
import type { CurrentDebitBalance } from "../models/CurrentDebitBalance";

const SIENGE_BASE_URL = process.env.SIENGE_BASE_URL!;
const SIENGE_USER = process.env.SIENGE_USER!;
const SIENGE_PASS = process.env.SIENGE_PASS!;

/**
 * Rota usada (exemplo real): GET {BASE}/receivables/current-debit-balance?cpf=000...
 * Ajuste se a sua rota for diferente.
 */
export default async function BuscarDebitoClienteService(
  cpf: string
): Promise<CurrentDebitBalance | { error: string }> {
  try {
    const url = `${SIENGE_BASE_URL}/current-debit-balance`;
    console.log("ver o o url aqui ", url);
    const resp = await axios.get<CurrentDebitBalance>(url, {
      params: { cpf },
      auth: { username: SIENGE_USER, password: SIENGE_PASS },
      validateStatus: () => true
    });

    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    console.log("ver o resp aqui3 ", resp.data);
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar débitos" };
  }
}
