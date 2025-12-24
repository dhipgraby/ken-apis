export const excludeFields = (obj: any, fields: string[]) => {
    // Create a new object excluding specified fields
    return Object.keys(obj).reduce((acc, key) => {
        if (!fields.includes(key)) {
            acc[key] = obj[key];
        }
        return acc;
    }, {});
};

export function excludeSensitiveFields(obj: any, excludedFields: string[]): any {
    return excludeFields(obj, excludedFields);
}

export const removeUserIdPrefix = (url: string, userId: number): string => {
    const prefix = `${userId}-`;
    if (url.startsWith(prefix)) {
        return url.slice(prefix.length);
    }
    return url;
};