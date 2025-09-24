import { Global, Module } from '@nestjs/common';
import knex, { Knex } from 'knex';
import { ConfigNotifyModule } from '../src/config-notify/config-notify.module';

@Global()
@Module({
  providers: [
    {
      provide: 'KNEX_CONNECTION',
      useFactory: (): Knex =>
        knex({
          client: 'pg',
          connection: process.env.CONFIGURATION_DATABASE_URL,
        }),
    },
  ],
  exports: ['KNEX_CONNECTION'],
  imports: [ConfigNotifyModule],
})
export class KnexModule {}
