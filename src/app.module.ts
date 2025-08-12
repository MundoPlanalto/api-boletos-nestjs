import { Module } from '@nestjs/common';
import { BoletosService } from './boletos/boletos.service';
import { BoletosController } from './boletos/boletos.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [],
  controllers: [BoletosController],
  providers: [BoletosService, PrismaService]
})
export class AppModule {}
