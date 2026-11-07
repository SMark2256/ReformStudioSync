import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/filters/app-exception.filter';
import { validationExceptionFactory } from './common/filters/validation-exception.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  const corsOrigin = configService.get<string>('CORS_ORIGIN') ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ReformStudioSync API')
    .setDescription(
      'ReformStudioSync — Recepciós, Pénzügyi és Valós Idejű Vendégmonitor REST & WebSocket API',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port);
  console.log(`ReformStudioSync API listening on http://localhost:${port}/api`);
  console.log(`Swagger OpenAPI Docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
