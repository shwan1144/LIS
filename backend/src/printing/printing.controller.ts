import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QzSigningService } from './qz-signing.service';

type QzSignBody = {
  payload?: string;
};

@Controller('printing/qz')
@UseGuards(JwtAuthGuard)
export class PrintingController {
  constructor(private readonly qzSigningService: QzSigningService) {}

  @Get('certificate')
  getCertificate() {
    return {
      certificate: this.qzSigningService.getCertificate(),
      algorithm: this.qzSigningService.getSignatureAlgorithm(),
    };
  }

  @Post('sign')
  signPayload(@Body() body: QzSignBody) {
    if (typeof body?.payload !== 'string' || body.payload.trim().length === 0) {
      throw new BadRequestException('payload is required');
    }

    return {
      signature: this.qzSigningService.signPayload(body.payload),
      algorithm: this.qzSigningService.getSignatureAlgorithm(),
    };
  }
}
