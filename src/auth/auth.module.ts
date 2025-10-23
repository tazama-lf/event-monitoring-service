import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService, AuthGuard } from './auth.guard';
import { TazamaAuthGuard } from './tazama-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [AuthService, AuthGuard, TazamaAuthGuard],
  exports: [AuthService, AuthGuard, TazamaAuthGuard],
})
export class AuthModule {}
