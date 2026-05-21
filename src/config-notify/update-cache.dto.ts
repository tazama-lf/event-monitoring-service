import { IsEnum } from 'class-validator';
import { PublishingStatus } from '../enums/publishingStatus.enum';

export class UpdateCacheDto {
  @IsEnum(PublishingStatus, {
    message: 'publishing_status must be either "active" or "inactive"',
  })
  publishing_status!: PublishingStatus;
}
