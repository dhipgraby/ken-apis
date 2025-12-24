import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoginModule } from './auth.module';
// import * as fs from 'fs';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();

  const port = 3001;

  //eslint-disable-next-line
  // const httpsOptions =
  //   process.env.PROD === 'true'
  //     ? {
  //         key: fs.readFileSync('/root/ssl/key.pem'),
  //         cert: fs.readFileSync('/root/ssl/cert.pem'),
  //       }
  //     : {};

  if (process.env.PROD === 'true') console.log('running PROD');

  const app = await NestFactory.create(LoginModule, {
    // httpsOptions,
  });

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
  console.log('AUTHENTICATION API RUNNING ON PORT: ' + port);
  await app.listen(port);
}
bootstrap();
