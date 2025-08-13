import axios from "axios";
import type { PaymentSlip } from "../models/PaymentSlip";

const SIENGE_BASE_URL = process.env.SIENGE_BASE_URL!;
const SIENGE_USER = process.env.SIENGE_USER!;
const SIENGE_PASS = process.env.SIENGE_PASS!;

/**
 * Rota usada (exemplo real): GET {BASE}/payment-slip-notification?billReceivableId=...&installmentId=...
 * Mantive a **assinatura com DOIS argumentos**, como no seu projeto original.
 */
export default async function BuscarBoletoClienteService(
  billReceivableId: number,
  installmentId: number
): Promise<PaymentSlip | { error: string }> {
  try {
    const url = `${SIENGE_BASE_URL}/payment-slip-notification`;
    const resp = await axios.get<PaymentSlip>(url, {
      params: { billReceivableId, installmentId },
      auth: { username: SIENGE_USER, password: SIENGE_PASS },
      validateStatus: () => true
    });

    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar boleto" };
  }
}
