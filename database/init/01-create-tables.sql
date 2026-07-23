-- SPDX-License-Identifier: Apache-2.0

-- Create the config table (stores configuration for different message families and transaction types)
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

-- Create the dems_quarantine table (stores requests that fail validation or processing)
CREATE TABLE dems_quarantine (
    id UUID PRIMARY KEY,
    correlation_id VARCHAR(255) NULL,
    tenant_id VARCHAR(255) NOT NULL,
    endpoint_path VARCHAR(500) NOT NULL,
    config_id VARCHAR(255),
    version VARCHAR(50),
    error JSONB,
    raw_payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'failed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
