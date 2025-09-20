import { Global, Module } from '@nestjs/common';
import knex, { Knex } from 'knex';

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
})
export class KnexModule {}
