'use server';

// DO NOT re-export types from a 'use server' file.
// Consumers should import types directly from their source files if needed.
// Example: import type { FileTreeItem } from './github/fileTree';

// Explicitly import and re-export only the async Server Action functions.

import {
    getFileTree
} from './github/fileTree';

import {
    getFileContent,
    getLatestFileSha
} from './github/fileContent';

import {
    createOrUpdateFile,
    deleteFile,
    createFolder,
    renameFile,
    saveDraft
} from './github/fileOperations';

import {
    getCommitsForFile,
    commitMultipleFiles
} from './github/commitOperations';

export {
    // fileTree
    getFileTree,
    // fileContent
    getFileContent,
    getLatestFileSha,
    // fileOperations
    createOrUpdateFile,
    deleteFile,
    createFolder,
    renameFile,
    saveDraft,
    // commitOperations
    getCommitsForFile,
    commitMultipleFiles
};


// NOTE: The helper functions in ./github/helpers.ts are internal
// and are not re-exported here.