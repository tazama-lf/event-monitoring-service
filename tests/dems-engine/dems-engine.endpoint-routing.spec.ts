// SPDX-License-Identifier: Apache-2.0

// Regression test for issue #84: proves — via a REAL HTTP request through the actual Nest/Express
// routing layer, not a direct unit-level controller call — exactly what shape `@Param('endpoint')`
// receives for both the slash-delimited and comma-delimited forms of the `*endpoint` wildcard.
//
// This matters because a direct call like `controller.messageHandler('a,b,c', ...)` (as done in
// dems-engine.controller.spec.ts) never exercises route matching at all — it can't tell us what
// shape `@Param('endpoint')` actually receives. This test boots a minimal Nest app with just the
// route definition and captures the raw param value Express/Nest hand to the handler.
//
// Confirmed shape on this @nestjs/core + Express 5 (path-to-regexp v8) pairing: the wildcard param
// is an ARRAY OF SEGMENTS for both forms —
//   slash form  /DEFAULT/v1/iso20022/pacs.008.001.10  -> ["DEFAULT","v1","iso20022","pacs.008.001.10"]
//   comma form  /DEFAULT,v1,iso20022,pacs.008.001.10  -> ["DEFAULT,v1,iso20022,pacs.008.001.10"] (one element)
// `src/utils/transform_endpoint.ts` (`normalizeEndpointSegments`) is what reconciles these two shapes
// into one canonical path. If a future framework upgrade changes this (e.g. the param becomes a
// plain string), this test will fail — which is the signal that `normalizeEndpointSegments` needs to
// be updated for the new shape.

import { Controller, INestApplication, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { transformEndpoint } from '../../src/utils/transform_endpoint';

let capturedEndpointParam: unknown;

@Controller('/dems-engine')
class EndpointCaptureController {
  @Post('*endpoint')
  capture(@Param('endpoint') endpoint: unknown): { ok: true } {
    capturedEndpointParam = endpoint;
    return { ok: true };
  }
}

describe('DEMS ingest endpoint wildcard routing (issue #84)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EndpointCaptureController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    capturedEndpointParam = undefined;
  });

  it('captures the slash-delimited form as an array of segments', async () => {
    await request(app.getHttpServer()).post('/dems-engine/DEFAULT/v1/iso20022/pacs.008.001.10').send({}).expect(201);

    expect(capturedEndpointParam).toEqual(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10']);
  });

  it('captures the comma-delimited (legacy) form as a single-element array', async () => {
    await request(app.getHttpServer()).post('/dems-engine/DEFAULT,v1,iso20022,pacs.008.001.10').send({}).expect(201);

    expect(capturedEndpointParam).toEqual(['DEFAULT,v1,iso20022,pacs.008.001.10']);
  });

  it('both forms normalize to the same logical endpoint via normalizeEndpointSegments', async () => {
    await request(app.getHttpServer()).post('/dems-engine/TAZAMA/v1/iso20022/pacs.002.001.12').send({}).expect(201);
    const slashResult = transformEndpoint(capturedEndpointParam);

    await request(app.getHttpServer()).post('/dems-engine/TAZAMA,v1,iso20022,pacs.002.001.12').send({}).expect(201);
    const commaResult = transformEndpoint(capturedEndpointParam);

    expect(slashResult).toBe(commaResult);
    expect(slashResult).toBe('/TAZAMA/v1/iso20022/pacs.002.001.12');
  });
});
