// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdminModule } from './admin.module';
import * as dotenv from 'dotenv';
import { ExpressAdapter } from '@bull-board/express';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  dotenv.config();

  const port = 3003;

  const app = await NestFactory.create<NestExpressApplication>(AdminModule);
  app.useGlobalPipes(new ValidationPipe());

  // Configure CORS to allow admin frontend
  app.enableCors({
    origin: [
      process.env.PROD === 'false'
        ? 'http://localhost:3031'
        : 'https://admin.gozerocalculator.net',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Serve uploaded assets from /uploads without path-to-regexp wildcard issues
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Swagger
  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle('Admin API')
    .setDescription('API for handling users and organizations from admin')
    .setVersion('1.0')
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
