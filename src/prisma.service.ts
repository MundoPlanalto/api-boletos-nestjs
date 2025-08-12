import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  enableShutdownHooks(app: INestApplication): void {
    // beforeExit (Node) – sem async direto no handler
    process.on('beforeExit', () => {
      void (async () => {
        try {
          await this.$disconnect();
        } finally {
          await app.close();
        }
      })();
    });

    // opcional: também feche em SIGINT/SIGTERM (Ctrl+C / kill)
    process.once('SIGINT', () => {
      void (async () => {
        try {
          await this.$disconnect();
        } finally {
          await app.close();
          process.exit(0);
        }
      })();
    });

    process.once('SIGTERM', () => {
      void (async () => {
        try {
          await this.$disconnect();
        } finally {
          await app.close();
        }
      })();
    });
  }
}
