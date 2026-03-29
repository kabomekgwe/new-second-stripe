import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { getCsrfConfig } from '../config/csrf.config';
import { ConfigService } from '@nestjs/config';

@Controller('csrf')
export class CsrfController {
  constructor(private readonly configService: ConfigService) {}

  @Get('token')
  getCsrfToken(@Req() req: Request, @Res() res: Response) {
    const { generateCsrfToken } = getCsrfConfig(this.configService);

    // Generate a new CSRF token for this session
    const csrfToken = generateCsrfToken(req, res);

    // Return the token to the client
    return res.json({
      csrfToken,
    });
  }
}