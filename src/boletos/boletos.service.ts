/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma.service';

import BuscarClienteSiengeService from './functions/BuscarClienteSiengeService';
import BuscarDebitoClienteService from './functions/BuscarDebitoClienteService';
import BuscarBoletoClienteService from './functions/BuscarBoletoClienteService';

import type { PaymentSlip } from './models/PaymentSlip';
import type { CurrentDebitBalance } from './models/CurrentDebitBalance';
import type { CustomerResponse } from './models/CustomerResponse';

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

type RequestType = 'SINGLE' | 'ALL' | 'ALL_ENTERPRISES';

@Injectable()
export class BoletosService {
  constructor(private readonly prisma: PrismaService) { }

  // ------------- LOG -------------
  private async logRequestStart(params: {
    cpf: string;
    customerName?: string;
    requestType: RequestType;
    endpoint?: string;
    companyId?: number;
  }) {
    return this.prisma.boletoRequestLog.create({
      data: {
        cpf: params.cpf,
        customerName: params.customerName ?? null,
        requestType: params.requestType as any,
        endpoint: params.endpoint ?? null,
        companyId: params.companyId ?? null,
        success: false,
      },
    });
  }

  private async logInstallments(
    requestId: string,
    items: Array<{
      billReceivableId?: number;
      installmentId?: number;
      parcelaNumber?: number;
      dueDate?: string | Date | null;
      amount?: number | null;
      generatedBoleto?: boolean | null;
      urlReport?: string | null;
    }>,
  ) {
    if (!items?.length) return;

    await this.prisma.boletoInstallmentLog.createMany({
      data: items.map((i) => ({
        requestId,
        billReceivableId: i.billReceivableId ?? null,
        installmentId: i.installmentId ?? null,
        parcelaNumber: i.parcelaNumber ?? null,
        dueDate: i.dueDate ? new Date(i.dueDate) : null,
        amount: i.amount ?? null,
        generatedBoleto: i.generatedBoleto ?? null,
        urlReport: i.urlReport ?? null,
        hasUrl: !!i.urlReport && i.urlReport.length > 0,
      })),
    });
  }

  private async logRequestFinish(
    id: string,
    data: {
      statusCode?: number;
      success: boolean;
      errorMessage?: string;
      responseTimeMs?: number;
    },
  ) {
    return this.prisma.boletoRequestLog.update({
      where: { id },
      data,
    });
  }

  // ------------- SEGUNDA VIA (parcela única) -------------
  async emitirParcelaUnica(params: {
    cpf: string;
    companyId: number;
    billReceivableId: number;
    installmentId: number;
  }) {
    const { cpf, companyId, billReceivableId, installmentId } = params;
    const start = Date.now();

    const cliente = (await BuscarClienteSiengeService(cpf)) as
      | CustomerResponse
      | { error: string };
    const customerName: string | undefined = (cliente as CustomerResponse)
      ?.results?.[0]?.name;

    const reqLog = await this.logRequestStart({
      cpf,
      companyId,
      customerName,
      requestType: 'SINGLE',
      endpoint: '/boletos/segunda-via',
    });

    try {
      const resp = (await BuscarBoletoClienteService(
        billReceivableId,
        installmentId,
      )) as PaymentSlip | { error: string };

      if ((resp as any)?.error) {
        await this.logInstallments(reqLog.id, [
          {
            billReceivableId,
            installmentId,
            parcelaNumber: installmentId,
            urlReport: null,
          },
        ]);
        await this.logRequestFinish(reqLog.id, {
          statusCode: 400,
          success: false,
          responseTimeMs: Date.now() - start,
          errorMessage: (resp as any).error,
        });
        return resp;
      }

      const urlReport: string | null =
        (resp as PaymentSlip)?.results?.[0]?.urlReport ?? null;

      await this.logInstallments(reqLog.id, [
        {
          billReceivableId,
          installmentId,
          parcelaNumber: installmentId,
          urlReport,
        },
      ]);

      await this.logRequestFinish(reqLog.id, {
        statusCode: 200,
        success: true,
        responseTimeMs: Date.now() - start,
      });

      return resp;
    } catch (e: any) {
      await this.logRequestFinish(reqLog.id, {
        statusCode: e?.response?.status ?? 500,
        success: false,
        responseTimeMs: Date.now() - start,
        errorMessage: e?.message || 'erro na emissão',
      });
      throw e;
    }
  }

  // LISTA boletos apenas de um empreendimento (sem dueDate/value)
  async listarBoletosDoEmpreendimento(params: { cpf: string; companyId: number }) {
    const { cpf, companyId } = params;

    const cliente = await BuscarClienteSiengeService(cpf);
    const nomeCliente = (cliente as any)?.results?.[0]?.name || 'cliente';

    // 1) Busca todos os débitos do CPF
    const debitos = await BuscarDebitoClienteService(cpf);
    const debitosList = (debitos as any).results ?? [];

    // 2) Mapear bill -> companyId (reaproveitando sua lógica)
    const bills: number[] = Array.from(
      new Set<number>(debitosList.map((d: any) => Number(d.billReceivableId))),
    );
    const billCompanyMap = new Map<number, number>();

    await Promise.all(
      bills.map(async (bill: number) => {
        try {
          const { data } = await axios.get(
            `https://api.sienge.com.br/mundoplanalto/public/api/v1/accounts-receivable/receivable-bills/${bill}`,
            {
              auth: {
                username: 'mundoplanalto-brayan',
                password: 'msp29bmeOhMcBcxusnLy2sHO1U0jnng1',
              },
            },
          );
          billCompanyMap.set(bill, Number(data.companyId ?? 0));
        } catch {
          billCompanyMap.set(bill, 0);
        }
      }),
    );

    // 3) Filtrar os débitos apenas do company desejado e montar tarefas de busca de URL
    type Task = { bill: number; inst: number; tipo: 'vencido' | 'aberto' };
    const tasks: Task[] = [];

    for (const debito of debitosList) {
      const bill: number = Number(debito.billReceivableId);
      if (billCompanyMap.get(bill) !== companyId) continue;

      for (const inst of debito.dueInstallments ?? []) {
        tasks.push({ bill, inst: Number(inst.installmentId), tipo: 'vencido' });
      }
      for (const inst of debito.payableInstallments ?? []) {
        if (!inst.generatedBoleto) continue;
        tasks.push({ bill, inst: Number(inst.installmentId), tipo: 'aberto' });
      }
    }

    // 4) Buscar as URLs de cada parcela
    const vencidos: Array<{ parcela: number; bill: number; link: string | null }> = [];
    const emAberto: Array<{ parcela: number; bill: number; link: string | null }> = [];

    const resultados = await Promise.all(
      tasks.map(t =>
        BuscarBoletoClienteService(t.bill, t.inst)
          .then((info: any) => {
            const found = info?.results?.find((r: any) => r?.urlReport);
            return { ...t, url: found?.urlReport ?? null };
          })
          .catch(() => ({ ...t, url: null })),
      ),
    );

    for (const r of resultados) {
      const alvo = r.tipo === 'vencido' ? vencidos : emAberto;
      alvo.push({ parcela: r.inst, bill: r.bill, link: r.url });
    }

    // 5) Montar retorno igual ao /todos-empreendimentos, porém só para um
    const chave = `${companyId} - empreendimento`; // se quiser, resolva o nome como no outro endpoint
    const payload = {
      [chave]: {
        total: vencidos.length + emAberto.length,
        vencidos,
        emAberto,
      },
    };

    return {
      mensagem:
        vencidos.length + emAberto.length > 0
          ? `📄 Olá, *${nomeCliente}*! Encontramos boletos do empreendimento selecionado.`
          : `📄 Olá, *${nomeCliente}*! Não há boletos disponíveis para este empreendimento.`,
      cliente: nomeCliente,
      companyId,
      boletos: payload,
    };
  }



  // ------------- TodasS as parcelas de um BillReceivableId (CT) -------------
  async emitirTodasParcelas(params: {
    cpf: string;
    companyId: number;
    billReceivableId: number;
    parcelas: Array<{
      installmentId: number;
      dueDate?: string;
      amount?: number;
      generatedBoleto?: boolean;
    }>;
  }) {
    const { cpf, companyId, billReceivableId, parcelas } = params;
    const start = Date.now();

    const cliente = (await BuscarClienteSiengeService(cpf)) as
      | CustomerResponse
      | { error: string };
    const customerName: string | undefined = (cliente as CustomerResponse)
      ?.results?.[0]?.name;

    const reqLog = await this.logRequestStart({
      cpf,
      companyId,
      customerName,
      requestType: 'ALL',
      endpoint: '/boletos/todos',
    });

    let finalStatus = 200;
    let sucesso = true;

    const logsParcelas: any[] = [];
    const saida: Array<{ installmentId: number; urlReport: string | null }> =
      [];

    for (const p of parcelas) {
      try {
        const resp = (await BuscarBoletoClienteService(
          billReceivableId,
          p.installmentId,
        )) as PaymentSlip | { error: string };

        const urlReport: string | null = (resp as any)?.error
          ? null
          : ((resp as PaymentSlip)?.results?.[0]?.urlReport ?? null);

        saida.push({ installmentId: p.installmentId, urlReport });

        logsParcelas.push({
          billReceivableId,
          installmentId: p.installmentId,
          parcelaNumber: p.installmentId,
          dueDate: p.dueDate ?? null,
          amount: p.amount ?? null,
          generatedBoleto: p.generatedBoleto ?? null,
          urlReport,
        });

        if ((resp as any)?.error) {
          sucesso = false;
          finalStatus = 400;
        }
      } catch (err: any) {
        sucesso = false;
        finalStatus = err?.response?.status || 500;

        logsParcelas.push({
          billReceivableId,
          installmentId: p.installmentId,
          parcelaNumber: p.installmentId,
          dueDate: p.dueDate ?? null,
          amount: p.amount ?? null,
          generatedBoleto: p.generatedBoleto ?? null,
          urlReport: null,
        });
      }
    }

    await this.logInstallments(reqLog.id, logsParcelas);
    await this.logRequestFinish(reqLog.id, {
      statusCode: finalStatus,
      success: sucesso,
      responseTimeMs: Date.now() - start,
      errorMessage: sucesso ? undefined : 'uma ou mais parcelas falharam',
    });

    return { billReceivableId, parcelas: saida };
  }

  // ------------- Todos Empreendimentos -------------
  async emitirTodosEmpreendimentos(params: { cpf: string }) {
    const { cpf } = params;

    const cliente = await BuscarClienteSiengeService(cpf);
    const nomeCliente = (cliente as any)?.results?.[0]?.name || 'cliente';

    const debitos = await BuscarDebitoClienteService(cpf);
    const debitosList = (debitos as any).results ?? [];

    const agrupado: Record<string, { vencidos: any[]; emAberto: any[] }> = {};
    const companyIds = new Set<number>();

    const contratos: number[] = Array.from(
      new Set<number>(debitosList.map((d: any) => Number(d.billReceivableId))),
    );

    // cache local bill -> { companyId, enterpriseName }
    const billCompanyMap = new Map<
      number,
      { companyId: number; nome: string }
    >();

    await Promise.all(
      contratos.map((bill: number) =>
        axios
          .get(
            `https://api.sienge.com.br/mundoplanalto/public/api/v1/accounts-receivable/receivable-bills/${bill}`,
            {
              auth: {
                username: 'mundoplanalto-brayan',
                password: 'msp29bmeOhMcBcxusnLy2sHO1U0jnng1',
              },
            },
          )
          .then((res) => {
            const dados = {
              companyId: res.data.companyId,
              nome: res.data.enterpriseName,
            };
            billCompanyMap.set(bill, dados);
            return { bill, ...dados };
          })
          .catch(() => {
            const dados = { companyId: 0, nome: 'não identificado' };
            billCompanyMap.set(bill, dados);
            return { bill, ...dados };
          }),
      ),
    );

    type Task = {
      companyId: number;
      inst: number;
      bill: number;
      tipo: 'vencido' | 'aberto';
    };
    const tasks: Task[] = [];

    for (const debito of debitosList) {
      const bill: number = debito.billReceivableId;
      const meta = billCompanyMap.get(bill) || {
        companyId: 0,
        nome: 'não identificado',
      };

      const companyId = meta.companyId;
      const nomeEmp = meta.nome;
      if (companyId) companyIds.add(companyId);

      const chave = `${companyId} - ${nomeEmp}`;
      agrupado[chave] ??= { vencidos: [], emAberto: [] };

      for (const inst of debito.dueInstallments ?? []) {
        agrupado[chave].vencidos.push({
          parcela: inst.installmentId,
          bill,
          link: null,
        });
        tasks.push({
          companyId,
          bill,
          inst: inst.installmentId,
          tipo: 'vencido',
        });
      }

      for (const inst of debito.payableInstallments ?? []) {
        if (!inst.generatedBoleto) continue;
        agrupado[chave].emAberto.push({
          parcela: inst.installmentId,
          bill,
          link: null,
        });
        tasks.push({
          companyId,
          bill,
          inst: inst.installmentId,
          tipo: 'aberto',
        });
      }
    }

    // buscar URL de cada parcela
    const resultados = await Promise.all(
      tasks.map((t) =>
        BuscarBoletoClienteService(Number(t.bill), Number(t.inst))
          .then((info: any) => {
            const found = info.results?.find((r: any) => r.urlReport);
            return {
              companyId: t.companyId,
              tipo: t.tipo,
              inst: t.inst,
              bill: t.bill,
              url: found?.urlReport ?? null,
            };
          })
          .catch(() => ({
            companyId: t.companyId,
            tipo: t.tipo,
            inst: t.inst,
            bill: t.bill,
            url: null,
          })),
      ),
    );

    // aplicar URLs no agrupado
    for (const { companyId, tipo, inst, bill, url } of resultados) {
      const nomeEmp = billCompanyMap.get(bill)?.nome || 'não identificado';
      const chave = `${companyId} - ${nomeEmp}`;
      const arr =
        tipo === 'vencido'
          ? agrupado[chave].vencidos
          : agrupado[chave].emAberto;
      const obj = arr.find((o: any) => o.parcela === inst && o.bill === bill);
      if (obj) obj.link = url;
    }

    // montar objeto final
    const boletosFinal: Record<string, any> = {};
    for (const [chave, dados] of Object.entries(agrupado)) {
      boletosFinal[chave] = {
        total: dados.vencidos.length + dados.emAberto.length,
        vencidos: dados.vencidos,
        emAberto: dados.emAberto,
      };
    }

    // PDF unificado (base64)
    const pdfUnificado = await this.gerarPdfUnificadoPorEmpresas(agrupado, cpf);

    return {
      mensagem: Object.keys(boletosFinal).length
        ? `📄 Olá, *${nomeCliente}*! Encontramos boletos por empreendimento.`
        : `📄 Olá, *${nomeCliente}*! Não há boletos disponíveis.`,
      cliente: nomeCliente,
      companyIds: Array.from(companyIds),
      boletos: boletosFinal,
      pdf: pdfUnificado,
    };
  }

  // ------------- PDF Unificado (concat simples) -------------
  async gerarPdfUnificado(
    urls: string[],
    nomeArquivo?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const parts: Buffer[] = [];
    for (const u of urls) {
      if (!u) continue;
      const r = await axios.get<ArrayBuffer>(u, {
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (r.status >= 200 && r.status < 300) {
        parts.push(Buffer.from(r.data));
      }
    }
    const buffer = Buffer.concat(parts);
    const filename = (nomeArquivo || 'boletos') + '.pdf';
    return { buffer, filename };
  }

  // ======== Novos: PDFs com descriptografia (qpdf) ========

  // helper: unifica PDFs a partir de URLs (descriptografa com senha baseada no CPF)
  private async gerarPdfUnificadoPorLinks(
    urls: string[],
    cpf: string,
  ): Promise<Buffer | null> {
    if (!urls?.length) return null;

    const senha = cpf.replace(/\D/g, '').slice(0, 5);
    const pdfDoc = await PDFDocument.create();
    let temPagina = false;

    for (const url of urls) {
      if (!url) continue;
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer' });
        const encrypted = Buffer.from(resp.data);

        const inPath = path.join(
          os.tmpdir(),
          `enc-${Date.now()}-${Math.random()}.pdf`,
        );
        const outPath = path.join(
          os.tmpdir(),
          `dec-${Date.now()}-${Math.random()}.pdf`,
        );
        fs.writeFileSync(inPath, encrypted);

        const comando = `qpdf --password=${senha} --decrypt "${inPath}" "${outPath}"`;
        execFileSync(comando, { shell: true });

        const decryptedBytes = fs.readFileSync(outPath);
        const boletoPdf = await PDFDocument.load(decryptedBytes);
        const pages = await pdfDoc.copyPages(
          boletoPdf,
          boletoPdf.getPageIndices(),
        );
        pages.forEach((p) => pdfDoc.addPage(p));
        temPagina = true;

        fs.unlinkSync(inPath);
        fs.unlinkSync(outPath);
      } catch {
        // segue para a próxima URL
      }
    }

    if (!temPagina) return null;
    const mergedBytes = await pdfDoc.save();
    return Buffer.from(mergedBytes);
  }

  // PDF de Todos os empreendimentos do CPF (igual “todos-empreendimentos/pdf”)
  async gerarPdfTodosEmpreendimentos(
    cpf: string,
    nomeArquivo?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const start = Date.now();
    const cliente = (await BuscarClienteSiengeService(cpf)) as
      | CustomerResponse
      | { error: string };
    const customerName: string | undefined = (cliente as CustomerResponse)
      ?.results?.[0]?.name;

    const reqLog = await this.logRequestStart({
      cpf,
      customerName,
      requestType: 'ALL_ENTERPRISES',
      endpoint: '/boletos/todos-empreendimentos/pdf',
    });

    const debitos = (await BuscarDebitoClienteService(cpf)) as
      | CurrentDebitBalance
      | { error: string };
    if ((debitos as any)?.error) {
      await this.logRequestFinish(reqLog.id, {
        statusCode: 400,
        success: false,
        responseTimeMs: Date.now() - start,
        errorMessage: (debitos as any).error,
      });
      throw new Error((debitos as any).error);
    }

    // coletar todas as URLs (vencidos + gerados)
    const urls: string[] = [];
    const logs: any[] = [];

    for (const d of ((debitos as CurrentDebitBalance).results ?? []) as any[]) {
      const bill = d.billReceivableId;
      const instalments: any[] = [
        ...(d.dueInstallments ?? []),
        ...((d.payableInstallments ?? []).filter(
          (p: any) => p.generatedBoleto,
        ) ?? []),
      ];

      for (const inst of instalments) {
        const r = (await BuscarBoletoClienteService(
          bill,
          inst.installmentId,
        )) as PaymentSlip | { error: string };
        const url = (r as any)?.error
          ? null
          : ((r as PaymentSlip)?.results?.[0]?.urlReport ?? null);

        urls.push(...(url ? [url] : []));
        logs.push({
          billReceivableId: bill,
          installmentId: inst.installmentId,
          parcelaNumber: inst.installmentId,
          urlReport: url,
        });
      }
    }

    await this.logInstallments(reqLog.id, logs);

    const merged = await this.gerarPdfUnificadoPorLinks(urls, cpf);
    await this.logRequestFinish(reqLog.id, {
      statusCode: merged ? 200 : 404,
      success: !!merged,
      responseTimeMs: Date.now() - start,
      errorMessage: merged ? undefined : 'nenhum PDF válido',
    });

    if (!merged) {
      throw new Error('Não foi possível gerar o PDF unificado.');
    }

    const base = (nomeArquivo ?? 'boletos-todos-empreendimentos').replace(/\.pdf$/i, '');
    return {
      buffer: merged,
      filename: `${base}.pdf`
    };
  }

  // PDF Somente do empreendimento escolhido (segunda via)
  async gerarPdfSegundaViaDoEmpreendimento(
    cpf: string,
    companyId: number,
    nomeArquivo?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const start = Date.now();
    const cliente = (await BuscarClienteSiengeService(cpf)) as
      | CustomerResponse
      | { error: string };
    const customerName: string | undefined = (cliente as CustomerResponse)
      ?.results?.[0]?.name;

    const reqLog = await this.logRequestStart({
      cpf,
      companyId,
      customerName,
      requestType: 'ALL',
      endpoint: '/boletos/segunda-via/pdf-empresa',
    });

    // Reaproveita lógica: extrai todos, filtra por company do bill
    const debitos = await BuscarDebitoClienteService(cpf);
    const todos = this.extrairBoletos(debitos as any);

    // mapeia bill -> companyId
    const bills: number[] = Array.from(
      new Set<number>(todos.map((b: any) => Number(b.billReceivableId))),
    );
    const billCompanyMap = new Map<number, number>();
    await Promise.all(
      bills.map(async (bill: number) => {
        try {
          const { data } = await axios.get(
            `https://api.sienge.com.br/mundoplanalto/public/api/v1/accounts-receivable/receivable-bills/${bill}`,
            {
              auth: {
                username: 'mundoplanalto-brayan',
                password: 'msp29bmeOhMcBcxusnLy2sHO1U0jnng1',
              },
            },
          );
          billCompanyMap.set(bill, Number(data.companyId ?? 0));
        } catch {
          billCompanyMap.set(bill, 0);
        }
      }),
    );

    const apenasEmpresa = todos.filter(
      (b: any) => billCompanyMap.get(Number(b.billReceivableId)) === companyId,
    );

    const urls: string[] = [];
    const logs: any[] = [];

    for (const b of apenasEmpresa) {
      const r = (await BuscarBoletoClienteService(
        b.billReceivableId,
        b.installmentId,
      )) as PaymentSlip | { error: string };
      const url = (r as any)?.error
        ? null
        : ((r as PaymentSlip)?.results?.[0]?.urlReport ?? null);

      urls.push(...(url ? [url] : []));
      logs.push({
        billReceivableId: b.billReceivableId,
        installmentId: b.installmentId,
        parcelaNumber: b.installmentId,
        urlReport: url,
      });
    }

    await this.logInstallments(reqLog.id, logs);

    const merged = await this.gerarPdfUnificadoPorLinks(urls, cpf);
    await this.logRequestFinish(reqLog.id, {
      statusCode: merged ? 200 : 404,
      success: !!merged,
      responseTimeMs: Date.now() - start,
      errorMessage: merged ? undefined : 'nenhum PDF válido',
    });

    if (!merged) {
      throw new Error(
        'Não foi possível gerar o PDF do empreendimento selecionado.',
      );
    }

    return {
      buffer: merged,
      filename: (nomeArquivo || `boletos-empresa-${companyId}`) + '.pdf',
    };
  }

  // ===== helpers =====
  private extrairBoletos(debitos: any) {
    return debitos.results.flatMap((r: any) =>
      [
        ...(r.dueInstallments ?? []),
        ...(r.payableInstallments?.filter((p: any) => p.generatedBoleto) ?? []),
      ].map((inst: any) => ({
        billReceivableId: r.billReceivableId,
        installmentId: inst.installmentId,
      })),
    );
  }

  private async gerarPdfUnificadoPorEmpresas(
    agrupado: Record<string, { vencidos: any[]; emAberto: any[] }>,
    cpf: string,
  ): Promise<string | null> {
    const senha = cpf.replace(/\D/g, '').slice(0, 5);
    const pdfDoc = await PDFDocument.create();
    let temPagina = false;

    for (const [, dados] of Object.entries(agrupado)) {
      for (const boleto of [...dados.vencidos, ...dados.emAberto]) {
        if (!boleto.link) continue;
        try {
          const resp = await axios.get(boleto.link, {
            responseType: 'arraybuffer',
          });
          const encrypted = Buffer.from(resp.data);

          const inPath = path.join(
            os.tmpdir(),
            `enc-${Date.now()}-${Math.random()}.pdf`,
          );
          const outPath = path.join(
            os.tmpdir(),
            `dec-${Date.now()}-${Math.random()}.pdf`,
          );
          fs.writeFileSync(inPath, encrypted);

          const comando = `qpdf --password=${senha} --decrypt "${inPath}" "${outPath}"`;
          execFileSync(comando, { shell: true });

          const decryptedBytes = fs.readFileSync(outPath);
          const boletoPdf = await PDFDocument.load(decryptedBytes);
          const pages = await pdfDoc.copyPages(
            boletoPdf,
            boletoPdf.getPageIndices(),
          );
          pages.forEach((p) => pdfDoc.addPage(p));
          temPagina = true;

          fs.unlinkSync(inPath);
          fs.unlinkSync(outPath);
        } catch {
          // pula URL quebrada e segue
        }
      }
    }

    if (!temPagina) return null;
    const mergedBytes = await pdfDoc.save();
    return `data:application/pdf;base64,${Buffer.from(mergedBytes).toString('base64')}`;
  }

  async gerarPdfBufferUnificado(cpf: string): Promise<Buffer | null> {
    // 1) extrai Todos os boletos
    const debitos = await BuscarDebitoClienteService(cpf);
    const todos = this.extrairBoletos(debitos);

    // 2) busca a URL de cada boleto
    const withUrl = await Promise.all(
      todos.map(async b => {
        try {
          const info: any = await BuscarBoletoClienteService(
            Number(b.billReceivableId),
            Number(b.installmentId),
          );
          const found = info.results?.find((r: any) => r.urlReport);
          return found?.urlReport ?? null;
        } catch {
          return null;
        }
      }),
    );
    // filtra só as URLs válidas
    const urls = withUrl.filter((u): u is string => !!u);
    if (urls.length === 0) return null;

    // 3) decrypt + merge
    const senha = cpf.replace(/\D/g, '').slice(0, 5);
    const pdfDoc = await PDFDocument.create();
    let temPagina = false;

    for (const url of urls) {
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer' });
        const encrypted = Buffer.from(resp.data);
        const inPath = path.join(os.tmpdir(), `enc-${Date.now()}.pdf`);
        const outPath = path.join(os.tmpdir(), `dec-${Date.now()}.pdf`);
        fs.writeFileSync(inPath, encrypted);

        execFileSync(
          `qpdf --password=${senha} --decrypt "${inPath}" "${outPath}"`,
          { shell: true },
        );

        const decryptedBytes = fs.readFileSync(outPath);
        const boletoPdf = await PDFDocument.load(decryptedBytes);
        const pages = await pdfDoc.copyPages(
          boletoPdf,
          boletoPdf.getPageIndices(),
        );
        pages.forEach(p => pdfDoc.addPage(p));
        temPagina = true;

        fs.unlinkSync(inPath);
        fs.unlinkSync(outPath);
      } catch {
        // se falhar em um, apenas pula
      }
    }

    if (!temPagina) return null;
    const mergedBytes = await pdfDoc.save();
    return Buffer.from(mergedBytes);
  }

}
