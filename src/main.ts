/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { PrismaService } from './prisma.service';
import * as compression from 'compression';
import * as os from 'os';

async function bootstrap() {
  // (opcional) log simples para confirmar threadpool
  if (process.env.UV_THREADPOOL_SIZE) {
    console.log('[BOOT] UV_THREADPOOL_SIZE =', process.env.UV_THREADPOOL_SIZE);
  }

  const app = await NestFactory.create(AppModule, {
    // se quiser logs mais verbosos:
    // logger: ['error','warn','log'],
  });

  // confiar no proxy (Railway/Nginx/Cloudflare) para IP real e keep-alive correto
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance?.();
  if (instance?.set) instance.set('trust proxy', 1);

  // compressão HTTP (gzip/br) – coloque antes do bodyParser
  app.use(compression());

  // body limits (mantidos)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // validações globais (mantidas)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );

  // CORS (mantido; ajuste origins se quiser)
  app.enableCors();

  // Prisma shutdown hooks (mantido)
  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);

  // Ajustes de keep-alive/timeouts do Node para throughput melhor
  const server: any = app.getHttpServer();
  // mais tempo para conexões ociosas reaproveitarem keep-alive
  if (server) {
    // valores típicos; ajuste se necessário
    server.keepAliveTimeout = 75_000;   // 75s
    server.headersTimeout   = 80_000;   // 80s (deve ser > keepAliveTimeout)
    server.requestTimeout   = 0;        // sem timeout por request no Node; você já limita no axios
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[BOOT] API on http://0.0.0.0:${port} | CPUs=${os.cpus().length}`);
}
bootstrap();
