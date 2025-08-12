import { Body, Controller, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { BoletosService } from "./boletos.service";

@Controller("boletos")
export class BoletosController {
  constructor(private readonly boletosService: BoletosService) { }

  @Post("segunda-via")
  @HttpCode(HttpStatus.OK)
  async segundaVia(
    @Body()
    body: {
      cpf: string;
      companyId: number;
      billReceivableId: number;
      installmentId: number;
    }
  ) {
    const { cpf, companyId, billReceivableId, installmentId } = body;
    return await this.boletosService.emitirParcelaUnica({
      cpf,
      companyId,
      billReceivableId,
      installmentId
    });
  }

  @Post("todos")
  @HttpCode(HttpStatus.OK)
  async todasParcelas(
    @Body()
    body: {
      cpf: string;
      companyId: number;
      billReceivableId: number;
      parcelas: Array<{ installmentId: number; dueDate?: string; amount?: number; generatedBoleto?: boolean }>;
    }
  ) {
    const { cpf, companyId, billReceivableId, parcelas } = body;
    return await this.boletosService.emitirTodasParcelas({
      cpf,
      companyId,
      billReceivableId,
      parcelas
    });
  }

  @Post("todos-empreendimentos")
  @HttpCode(HttpStatus.OK)
  async todosEmpreendimentos(@Body() body: { cpf: string; companyId?: number }) {
    const { cpf } = body;
    return await this.boletosService.emitirTodosEmpreendimentos({ cpf });
  }

  @Post("pdf")
  @HttpCode(HttpStatus.OK)
  async pdfUnificado(@Body() body: { nomeArquivo?: string; urls: string[] }, @Res() res: Response) {
    const { buffer, filename } = await this.boletosService.gerarPdfUnificado(body.urls, body.nomeArquivo);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.send(buffer);
  }

  // PDF unificado com boletos de TODOS os empreendimentos do CPF
  @Post('todos-empreendimentos/pdf')
  @HttpCode(HttpStatus.OK)
  async todosEmpreendimentosPdf(
    @Body() body: { cpf: string; nomeArquivo?: string },
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.boletosService.gerarPdfTodosEmpreendimentos(
      body.cpf,
      body.nomeArquivo,
    );

    res.type('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'no-store');

    return res.end(buffer); // envia o Buffer cru
  }

  // PDF unificado somente do empreendimento escolhido (segunda via)
  @Post('segunda-via/pdf-empresa')
  @HttpCode(HttpStatus.OK)
  async segundaViaPdfEmpresa(
    @Body() body: { cpf: string; companyId: number; nomeArquivo?: string },
    @Res() res: Response
  ) {
    const { buffer, filename } =
      await this.boletosService.gerarPdfSegundaViaDoEmpreendimento(
        body.cpf,
        body.companyId,
        body.nomeArquivo // no service já cai no default se não vier
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');

    return res.end(buffer);
  }

}
