import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UsersModule } from './users.module';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  dotenv.config();

  //eslint-disable-next-line
  // const httpsOptions =
  //   process.env.PROD === 'true'
  //     ? {
  //       key: fs.readFileSync('/root/ssl/key.pem'),
  //       cert: fs.readFileSync('/root/ssl/cert.pem'),
  //     }
  //     : {};

  const port = 3002;

  const app = await NestFactory.create(UsersModule, {});

  // Serve uploaded assets from /uploads without wildcard pattern issues
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle('Users & Organizations API')
    .setDescription(
      'API for user profiles, organizations management, memberships and licensing',
    )
    .setVersion('1.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('documentation', app, document);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();
  console.log('USERS API RUNNING ON PORT: ' + port);
  await app.listen(port);
}
bootstrap();
