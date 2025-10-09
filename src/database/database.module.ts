import { Module } from '@nestjs/common';
import { KnexModule } from 'nest-knexjs';

@Module({
  imports: [
    KnexModule.forRoot({
      config: {
        client: 'pg',
        useNullAsDefault: true,
        connection: {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT!),
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
        },
        migrations: {
          directory: './knex/migrations',
          extension: 'ts',
        },
      },
    }),
  ],
  exports: [KnexModule],
})
export class DatabaseModule {}
