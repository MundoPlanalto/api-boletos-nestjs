import type { PaymentSlip } from "../models/PaymentSlip";
import { axiosSienge } from "src/shared/http";

export default async function BuscarBoletoClienteService(
  billReceivableId: number,
  installmentId: number
): Promise<PaymentSlip | { error: string }> {
  try {
    const resp = await axiosSienge.get<PaymentSlip>(
      '/payment-slip-notification',
      { params: { billReceivableId, installmentId } }
    );    

    if (typeof resp.data === "object" && (resp.data as any)?.error) {
      return { error: (resp.data as any).error };
    }
    return resp.data;
  } catch (e: any) {
    return { error: e?.message ?? "Erro ao buscar boleto" };
  }
}
