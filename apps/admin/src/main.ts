import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdminModule } from './admin.module';
import * as dotenv from 'dotenv';
import { ExpressAdapter } from '@bull-board/express';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';
import { announceReady, runtimeOptions } from 'lib/common/config/local-runtime';

async function bootstrap() {
  let app: NestExpressApplication | undefined;
  try {
    dotenv.config();
    const options = runtimeOptions('admin');
    // Let bootstrap handle failures without Nest logging configuration secrets.
    app = await NestFactory.create<NestExpressApplication>(AdminModule, {
      abortOnError: false, logger: false,
    });
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    app.useGlobalPipes(new ValidationPipe());

    // Configure CORS to allow admin frontend.
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

    // Serve uploaded assets from /uploads without wildcard pattern issues.
    app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

    const config = new DocumentBuilder()
      .addBearerAuth()
      .setTitle('Admin API')
      .setDescription('API for handling users and organizations from admin')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('documentation', app, document);

    if (!options.local) {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');
      app.use('/admin/queues', serverAdapter.getRouter());
    }

    await app.listen(options.port, options.host);
    const url = await app.getUrl();
    announceReady('admin', url, options.local);
  } catch {
    process.exitCode = 1;
    console.error('Admin API startup failed');
    if (app) {
      try {
        await app.close();
      } catch {
        console.error('Admin API shutdown failed');
      }
    }
  }
}
void bootstrap();
