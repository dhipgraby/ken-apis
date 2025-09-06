// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdminModule } from './admin.module';
import * as dotenv from 'dotenv';
import { ExpressAdapter } from '@bull-board/express';

async function bootstrap() {
  dotenv.config();

  const port = 3005;

  const app = await NestFactory.create(AdminModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  // Swagger
  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle('Admin API')
    .setDescription('API for handling users from admin')
    .setVersion('1.0')
    .addTag('admin')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('documentation', app, document);

  // ---------------------
  // Bull Board
  // ---------------------
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  app.use('/admin/queues', serverAdapter.getRouter());

  // ---------------------
  console.log('ADMIN API RUNNING ON PORT: ' + port);
  await app.listen(port);
}
bootstrap();
