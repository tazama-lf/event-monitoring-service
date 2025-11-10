-- Firstly, create this table as its needed for storing configuration for different message families and transaction types
-- this is used as the first step on DEMS to validate using payload with schema using ajv
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

-- Genertic Example insert statement for config table
INSERT INTO config(
	id, msg_fam, transaction_type, endpoint_path, version, content_type, schema, mapping, tenant_id, created_by, created_at, updated_at, status, functions, publishing_status, comments)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Example insert statements for different message families and transaction types
INSERT INTO config (
  msg_fam,
  transaction_type,
  endpoint_path,
  version,
  content_type,
  schema,
  mapping,
  tenant_id,
  created_by,
  status,
  functions,
  publishing_status,
  comments
)
VALUES (
  'pacs.008',
  'credit_transfer',
  '/api/payments/credit-transfer',
  'v1',
  'application/json',
  '{
    "type": "object",
    "properties": {
      "transactionId": { "type": "string" },
      "amount": { "type": "number" },
      "currency": { "type": "string" }
    },
    "required": ["transactionId", "amount", "currency"]
  }'::jsonb,
  '[
    { "source": "transactionId", "destination": "TxnId" },
    { "source": "amount", "destination": "Amt" },
    { "source": "currency", "destination": "Ccy" }
  ]'::jsonb,
  'tenant_001',
  'admin_user',
  'inprogress',
  '[
    { "name": "formatDate", "type": "utility", "description": "Formats date to ISO8601" }
  ]'::jsonb,
  'active',
  'Initial configuration for PACS.008 credit transfer.'
);

-- sample payload for a pacs.008 credit transfer message
-- {
--   "transactionId": "TXN123456",
--   "amount": 2500.75,
--   "currency": "USD",
--   "debtor": {
--     "name": "John Doe",
--     "account": "US1234567890"
--   },
--   "creditor": {
--     "name": "Jane Smith",
--     "account": "US9876543210"
--   },
--   "instruction": {
--     "endToEndId": "E2E78901",
--     "remittanceInfo": "Invoice #INV-4587"
--   },
--   "timestamp": "2025-11-10T10:30:00Z"
-- }


INSERT INTO config (
  msg_fam,
  transaction_type,
  endpoint_path,
  version,
  content_type,
  schema,
  mapping,
  tenant_id,
  created_by,
  status,
  functions,
  publishing_status,
  comments
)
VALUES (
  'pacs.002',
  'payment_status',
  '/api/payments/status-report',
  'v1',
  'application/xml',
  '{
    "type": "object",
    "properties": {
      "originalMsgId": { "type": "string" },
      "transactionStatus": { "type": "string" },
      "reasonCode": { "type": "string" }
    },
    "required": ["originalMsgId", "transactionStatus"]
  }'::jsonb,
  '[
    { "source": "originalMsgId", "destination": "OrgnlMsgId" },
    { "source": "transactionStatus", "destination": "TxSts" },
    { "source": "reasonCode", "destination": "RsnCd" }
  ]'::jsonb,
  'tenant_001',
  'admin_user',
  'inprogress',
  '[
    { "name": "mapStatus", "type": "transformation", "description": "Maps internal status to ISO20022 status code" }
  ]'::jsonb,
  'inactive',
  'Initial configuration for PACS.002 payment status message.'
);

-- sample payload for a pacs.002 payment status message
-- {
--   "originalMsgId": "TXN123456",
--   "transactionStatus": "RJCT",
--   "reasonCode": "AC01",
--   "additionalInfo": "Invalid debtor account number",
--   "processedAt": "2025-11-10T10:45:00Z"
-- }



-- Next, create tables for each transaction type to store the actual documents
 -- replace 'xyz_name' with the actual table name based on transaction type
create table xyz_name (
    id serial primary key,
    document jsonb not null
);

-- If a rquest fails validation or processing, store it in the dems_quarantine table
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






















