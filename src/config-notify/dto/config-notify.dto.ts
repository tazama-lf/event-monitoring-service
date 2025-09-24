import { IsString, IsIn, IsUrl, IsISO8601 } from 'class-validator';

export class ConfigNotifyDto {
  @IsString()
  configId!: string;

  @IsString()
  version!: string;

  @IsString()
  tenantId!: string;

  @IsIn(['ADDED', 'UPDATED', 'REMOVED'])
  action!: 'ADDED' | 'UPDATED' | 'REMOVED';

  @IsISO8601()
  timestamp!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https', 'sftp', 'ftp'] })
  artifactLink!: string;
}
