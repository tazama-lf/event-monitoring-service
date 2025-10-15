import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService, AuthGuard } from './auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
