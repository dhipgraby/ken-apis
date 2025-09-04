import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { extname } from 'path';

@Injectable()
export class ParseFilePipeDocument implements PipeTransform {
    private readonly allowedExtensions = ['.png', '.pdf', '.jpeg', '.jpg', '.webp', '.webm', 'blob'];

    transform(value: any): any {
        if (this.isFile(value)) {
            this.validateFile(value);
            return value;
        } else if (this.isFileArray(value)) {
            value.forEach((file: Express.Multer.File) => this.validateFile(file));
            return value;
        } else if (this.isFileObject(value)) {
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const files = value[key];
                    if (this.isFileArray(files)) {
                        files.forEach((file: Express.Multer.File) => this.validateFile(file));
                    }
                }
            }
            return value;
        } else {
            throw new BadRequestException('Invalid file upload data');
        }
    }

    private isFile(file: any): file is Express.Multer.File {
        return file && file.originalname && file.size !== undefined;
    }

    private isFileArray(files: any): files is Express.Multer.File[] {
        return Array.isArray(files) && files.every(this.isFile);
    }

    private isFileObject(files: any): files is { [key: string]: Express.Multer.File[] } {
        return typeof files === 'object' && files !== null;
    }

    private validateFile(file: Express.Multer.File): void {

        if (file.originalname === "blob") return
        const extension = extname(file.originalname).toLowerCase();
        if (!this.allowedExtensions.includes(extension)) {
            throw new BadRequestException(`File type ${extension} not supported`);
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB
            throw new BadRequestException('File size exceeds the limit of 10MB');
        }
    }
}

export function getFileValidator(): PipeTransform {
    return new ParseFilePipeDocument();
}
