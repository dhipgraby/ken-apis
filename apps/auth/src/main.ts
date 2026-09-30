import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoginModule } from './auth.module';
import * as dotenv from 'dotenv';
import { announceReady, runtimeOptions } from 'lib/common/config/local-runtime';

async function bootstrap() {
  let app: INestApplication | undefined;
  try {
    dotenv.config();
    const options = runtimeOptions('auth');
    // Let bootstrap handle failures without Nest logging configuration secrets.
    app = await NestFactory.create(LoginModule, { abortOnError: false, logger: false });
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

    const config = new DocumentBuilder()
      .addBearerAuth()
      .setTitle('Authentication API')
      .setDescription(
        'Auth, user registration, login flows, password reset and email verification',
      )
      .setVersion('1.1')
      .addTag('Auth', 'Authentication & user account operations')
      .addTag('Root', 'Base endpoints / health checks')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('documentation', app, document);
    app.useGlobalPipes(new ValidationPipe());
    app.enableCors();
    await app.listen(options.port, options.host);
    const url = await app.getUrl();
    if (options.local) process.env.AUTH_BASE_URL = url;
    announceReady('auth', url, options.local);
  } catch {
    process.exitCode = 1;
    console.error('Authentication API startup failed');
    if (app) {
      try {
        await app.close();
      } catch {
        console.error('Authentication API shutdown failed');
      }
    }
  }
}
void bootstrap();
