/**
 * Utilities for handling chat file uploads (TXT and ZIP files)
 */

/**
 * Check if a file is a supported chat upload file type
 * @param file - The file to check
 * @returns true if the file is a .txt or .zip file
 */
export const isSupportedChatUploadFile = (file: File): boolean => {
  if (!file || !file.name) return false;
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.txt') || fileName.endsWith('.zip');
};

/**
 * Read the content of a chat upload file
 * @param file - The file to read
 * @param maxSizeBytes - Maximum allowed file size in bytes
 * @returns Promise resolving to the file content as a string
 * @throws Error if the file is too large or reading fails
 */
export const readChatUploadFile = async (file: File, maxSizeBytes: number): Promise<string> => {
  if (!file) {
    throw new Error('לא נבחר קובץ');
  }

  // Check file size
  if (file.size > maxSizeBytes) {
    const maxSizeMB = Math.floor(maxSizeBytes / (1024 * 1024));
    throw new Error(`הקובץ גדול מדי. הגודל המקסימלי הוא ${maxSizeMB}MB`);
  }

  const fileName = file.name.toLowerCase();

  // Handle ZIP files
  if (fileName.endsWith('.zip')) {
    return await readZipFile(file);
  }

  // Handle TXT files
  if (fileName.endsWith('.txt')) {
    return await readTextFile(file);
  }

  throw new Error('פורמט קובץ לא נתמך. העלו קובץ TXT או ZIP בלבד.');
};

/**
 * Read a plain text file
 * @param file - The text file to read
 * @returns Promise resolving to the file content
 */
const readTextFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content || content.trim().length === 0) {
          reject(new Error('הקובץ ריק'));
          return;
        }
        resolve(content);
      } catch (error) {
        reject(new Error('שגיאה בקריאת הקובץ'));
      }
    };

    reader.onerror = () => {
      reject(new Error('שגיאה בקריאת הקובץ'));
    };

    reader.readAsText(file, 'UTF-8');
  });
};

/**
 * Read and extract a ZIP file containing chat data
 * @param file - The ZIP file to read
 * @returns Promise resolving to the extracted text content
 */
const readZipFile = async (file: File): Promise<string> => {
  try {
    // Dynamically import JSZip to reduce initial bundle size
    const JSZip = (await import('jszip')).default;
    
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    
    // Find the first .txt file in the ZIP
    const txtFiles = Object.keys(zipContent.files).filter(name => 
      name.toLowerCase().endsWith('.txt') && !zipContent.files[name].dir
    );

    if (txtFiles.length === 0) {
      throw new Error('לא נמצא קובץ TXT בתוך הקובץ הדחוס');
    }

    // Read the first text file found
    const firstTxtFile = zipContent.files[txtFiles[0]];
    const content = await firstTxtFile.async('string');

    if (!content || content.trim().length === 0) {
      throw new Error('הקובץ ריק');
    }

    return content;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('שגיאה בחילוץ קובץ ZIP');
  }
};
