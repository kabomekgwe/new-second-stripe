import { Controller, Get } from '@nestjs/common';
import { register, collectDefaultMetrics } from 'prom-client';

// Automatically collect default Node.js metrics
collectDefaultMetrics();

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
