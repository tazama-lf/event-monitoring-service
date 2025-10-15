import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigNotifyModule } from './config-notify/config-notify.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { NatsModule } from './nats/nats.module';
import { DemsEngineModule } from './dems-engine/dems-engine.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ConfigNotifyModule,
    LoggerModule,
    DemsEngineModule,
    NatsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
