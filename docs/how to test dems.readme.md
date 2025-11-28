Follow these steps to test the DEMS (Data Event Monitoring Service):

1. Docker compose up to set up the correct environment and infrastructure:

   ```bash
   docker-compose up -d
   ```

2. Make sure you have the .env file configured with the necessary environment variables for DEMS.
   - Refer to env.example for guidance.

3. Connect to Database:
   - Use a database client (like pgAdmin, DBeaver, etc.) to connect to the DEMS database using the credentials specified in your .env file.

4. Create Required Database Tables:

   Create the `config` table (stores configuration for different message families and transaction types):

   ```sql
   CREATE TABLE config (
       id serial4 NOT NULL,
       msg_fam varchar(255) NOT NULL,
       transaction_type varchar(255) NOT NULL,
       endpoint_path varchar(255) NOT NULL,
       "version" varchar(255) DEFAULT 'v1'::character varying NOT NULL,
       content_type varchar(255) DEFAULT 'application/json'::character varying NOT NULL,
       "schema" jsonb NOT NULL,
       "mapping" jsonb NULL,
       tenant_id varchar(255) NOT NULL,
       created_by varchar(255) NOT NULL,
       created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
       updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
       status varchar(255) DEFAULT 'inprogress'::character varying NOT NULL,
       "functions" jsonb NULL,
       publishing_status varchar(8) DEFAULT 'inactive'::character varying NULL,
       "comments" text NULL,
       CONSTRAINT config_pkey PRIMARY KEY (id),
       CONSTRAINT publishing_status_check CHECK (((publishing_status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),
       CONSTRAINT uq_config_unique UNIQUE (msg_fam, transaction_type, endpoint_path, version, tenant_id)
   );
   CREATE INDEX idx_config_endpoint_lookup ON config USING btree (endpoint_path, version, tenant_id);
   CREATE INDEX idx_config_msg_fam ON config USING btree (msg_fam);
   CREATE INDEX idx_config_status ON config USING btree (status);
   CREATE INDEX idx_config_tenant ON config USING btree (tenant_id);
   CREATE INDEX idx_config_tenant_id ON config USING btree (tenant_id);
   CREATE INDEX idx_config_transaction_type ON config USING btree (transaction_type);
   ```

   Create the `dems_quarantine` table (stores requests that fail validation or processing):

   ```sql
   CREATE TABLE dems_quarantine (
       id UUID PRIMARY KEY,
       correlation_id VARCHAR(255) NULL,
       tenant_id VARCHAR(255) NOT NULL,
       endpoint_path VARCHAR(500) NOT NULL,
       config_id VARCHAR(255),
       version VARCHAR(50),
       error JSONB ,
       raw_payload JSONB NOT NULL,
       status VARCHAR(50) NOT NULL DEFAULT 'failed',
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```

5. Insert Test Data:
   - Use SQL scripts or your database client to insert test data into the relevant tables (config table) in the DEMS database.

6. Keycloak Setup (if applicable):
   - Ensure that Keycloak is running and configured correctly.
   - Create necessary realms, clients, and users for authentication.
   - dems:write claim is required for testing write operations.

7. Get a JWT Token:
   - Use a tool like Postman or curl to make a POST request to the authentication endpoint of the auth-service to obtain a JWT token.
   - Make sure the request includes valid user claims.

8. Start up the DEMS service:

   ```bash
   npm run start:dev
   ```

9. Test the DEMS API Endpoints:
   - Use the obtained JWT token to authenticate your requests to the DEMS API endpoints.
