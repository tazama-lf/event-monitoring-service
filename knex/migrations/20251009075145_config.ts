import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('config', (t) => {
    t.increments('id').primary();
    t.string('msg_fam').notNullable();
    t.string('transaction_type').notNullable();
    t.string('endpoint_path').notNullable();
    t.string('version').notNullable();
    t.string('content_type').notNullable();
    t.jsonb('schema').notNullable();
    t.jsonb('mapping').notNullable();
    t.string('tenant_id').notNullable();
    t.string('created_by').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.string('status').notNullable().defaultTo('ACTIVE');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('config');
}
