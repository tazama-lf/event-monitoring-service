import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';
import { ConfigNotifyModule } from '../src/config-notify/config-notify.module';

@Global()
@Module({
  providers: [
    {
      provide: 'KNEX_CONNECTION',
      useFactory: (configService: ConfigService): Knex =>
        knex({
          client: 'pg',
          connection: configService.get<string>('configurationDatabaseUrl'),
        }),
      inject: [ConfigService],
    },
  ],
  exports: ['KNEX_CONNECTION'],
  imports: [ConfigNotifyModule],
})
export class KnexModule {}
