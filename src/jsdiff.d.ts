// Tell TypeScript that the 'jsdiff' module exists and exports at least 'diffLines'.
declare module 'jsdiff' {
    // Use the Change interface structure provided by @types/diff
    export interface Change {
        count?: number;
        value: string;
        added?: boolean;
        removed?: boolean;
    }

    export function diffLines(oldStr: string, newStr: string, options?: any): Change[];
    
    // Add other exports from jsdiff here if you use them
} 