// utils/error-handler.ts
import { HttpStatus } from '@nestjs/common';

export interface CustomResponse<T> {
    success: boolean;
    message: string;
    statusCode: number;
    data?: T;
}

export const createErrorResponse = (message: string, statusCode: HttpStatus): CustomResponse<null> => ({
    success: false,
    message,
    statusCode,
    data: null,
});