import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';


export async function uploadFileToServer(file: any, UPLOAD_DIR: string, userId: number, docType: string) {
    const uploadDir = join(__dirname, UPLOAD_DIR);
    if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
    }

    const fileExtension = file.originalname.split('.').pop();  // Get the file extension
    const customFileName = fileExtension === "blob" ? `${userId}-${docType}.webm` : `${userId}-${docType}.${fileExtension}`;  // Create the custom file name    
    const filePath = join(uploadDir, customFileName);  // Save the file with the custom file name
    writeFileSync(filePath, file.buffer);

    return { message: "File uploaded", fileName: customFileName };  // Return the custom file name
}

export const ACCEPTED_FILE_TYPES_REGEX = /\.(jpeg|jpg|png|webp|pdf)$/;