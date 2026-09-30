import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UsersModule } from './users.module';
import * as express from 'express';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { announceReady, runtimeOptions } from 'lib/common/config/local-runtime';

async function bootstrap() {
  let app: INestApplication | undefined;
  try {
    dotenv.config();
    const options = runtimeOptions('users');
    // Let bootstrap handle failures without Nest logging configuration secrets.
    app = await NestFactory.create(UsersModule, { abortOnError: false, logger: false });
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

    // Serve uploaded assets from /uploads without wildcard pattern issues.
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
    await app.listen(options.port, options.host);
    const url = await app.getUrl();
    announceReady('users', url, options.local);
  } catch {
    process.exitCode = 1;
    console.error('Users API startup failed');
    if (app) {
      try {
        await app.close();
      } catch {
        console.error('Users API shutdown failed');
      }
    }
  }
}
void bootstrap();
