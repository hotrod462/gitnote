'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import * as Diff from 'diff';
import { getFileContent } from '@/lib/actions/github/fileContent';
import { commitMultipleFiles } from '@/lib/actions/github/commitOperations';
import type { StagedFileCommitDetails } from '@/lib/actions/github/commitOperations'; // Import type directly

// Input type expected by the hook
interface UseFileStagingAndCommitProps {
    onCommitSuccess?: () => void; // Callback after successful commit
}

// Type for the object returned by the hook
interface UseFileStagingAndCommitReturn {
    stagedFiles: Map<string, { content: ArrayBuffer | string }>;
    isCommitting: boolean;
    commitModalOpen: boolean;
    generatedCommitMsg: string;
    stagedPathsForModal: string[];
    isFetchingCommitMsg: boolean;
    handleFileDrop: (acceptedFiles: File[], targetFolder?: string) => void;
    setCommitModalOpen: (open: boolean) => void;
    handleConfirmMultiFileCommit: (commitMessage: string) => Promise<void>;
    clearStagedFiles: () => void;
}

export function useFileStagingAndCommit(props: UseFileStagingAndCommitProps = {}): UseFileStagingAndCommitReturn {
    const { onCommitSuccess } = props; // Destructure the callback
    const [stagedFiles, setStagedFiles] = useState<Map<string, { content: ArrayBuffer | string }>>(new Map());
    const [isCommitting, setIsCommitting] = useState(false);
    const [commitModalOpen, setCommitModalOpen] = useState(false);
    const [generatedCommitMsg, setGeneratedCommitMsg] = useState('');
    const [stagedPathsForModal, setStagedPathsForModal] = useState<string[]>([]);
    const [isFetchingCommitMsg, setIsFetchingCommitMsg] = useState(false);

    const handleFileDrop = useCallback((acceptedFiles: File[], targetFolder: string = '') => {
        console.log(`[Hook] Files dropped into folder: '${targetFolder}'`, acceptedFiles);
        const updates = new Map<string, { content: ArrayBuffer | string }>();
        const pathsToAdd: { path: string, fileReader: FileReader }[] = [];

        acceptedFiles.forEach((file) => {
            const reader = new FileReader();
            const relPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
            const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/,'');

            pathsToAdd.push({ path: cleanPath, fileReader: reader });

            reader.onabort = () => console.log('file reading was aborted');
            reader.onerror = () => console.error('file reading has failed');
            reader.onload = () => {
                const binaryStr = reader.result;
                if (binaryStr) {
                    updates.set(cleanPath, { content: binaryStr });
                    if (updates.size === acceptedFiles.length) {
                        console.log("[Hook] All files read, updating stagedFiles map...");
                        setStagedFiles(prev => {
                            const newMap = new Map(prev);
                            updates.forEach((value, key) => {
                                let shouldAdd = true;
                                for (const existingKey of Array.from(newMap.keys())) {
                                    if (existingKey.startsWith(key + '/')) {
                                        console.warn(`[Hook] Staging ${key}: Skipped, more specific path ${existingKey} already staged.`);
                                        shouldAdd = false;
                                        break;
                                    }
                                }
                                if (!shouldAdd) return;
                                const keysToDelete: string[] = [];
                                for (const existingKey of Array.from(newMap.keys())) {
                                    if (key.startsWith(existingKey + '/')) {
                                        console.log(`[Hook] Staging ${key}: Deleting less specific path ${existingKey}`);
                                        keysToDelete.push(existingKey);
                                    }
                                }
                                keysToDelete.forEach(k => newMap.delete(k));
                                console.log(`[Hook] Staging file: ${key}`);
                                newMap.set(key, value);
                            });
                            return newMap;
                        });
                    }
                } else {
                    console.error("[Hook] FileReader result was null or undefined for file:", file.name);
                    toast.error("Could not read the content of " + file.name + ".");
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = async (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                if (stagedFiles.size === 0 || isCommitting || isFetchingCommitMsg) {
                    return;
                }
                console.log("[Hook] Ctrl+S detected, opening commit modal and fetching message...");
                setStagedPathsForModal(Array.from(stagedFiles.keys()));
                setGeneratedCommitMsg('');
                setIsFetchingCommitMsg(true);
                setCommitModalOpen(true);

                try {
                    console.log("[Hook] Async: Fetching original content and calculating diffs...");
                    const patches: string[] = [];
                    for (const [path, { content }] of Array.from(stagedFiles.entries())) {
                        try {
                            const originalContentResult = await getFileContent(path);
                            const originalText = originalContentResult?.content ?? '';
                            let stagedText: string;
                            if (content instanceof ArrayBuffer) {
                                stagedText = new TextDecoder().decode(content);
                            } else {
                                stagedText = content;
                            }
                            const patch = Diff.createPatch(path, originalText, stagedText);
                            patches.push(patch);
                            console.log(`[Hook] Calculated diff for: ${path}`);
                        } catch (fetchError) {
                            console.error(`[Hook] Error fetching content for ${path}:`, fetchError);
                            patches.push(`--- Error fetching ${path} ---\n+++ ${path} (staged) +++\n@@ -0,0 +1 @@\n+ (Content could not be compared due to error)`);
                        }
                    }
                    const combinedDiff = patches.join('\n');
                    console.log("[Hook] Async: Combined Diff Calculated.");

                    let commitMessage = 'Update files';
                    if (combinedDiff.trim()) {
                        console.log("[Hook] Async: Calling API to generate commit message...");
                        try {
                            const response = await fetch('/api/generate-commit', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ diff: combinedDiff }),
                            });
                            if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.error || `API request failed with status ${response.status}`);
                            }
                            const result = await response.json();
                            commitMessage = result.message || commitMessage;
                            console.log("[Hook] Async: Generated Commit Message:", commitMessage);
                        } catch (apiError) {
                            console.error("[Hook] Async: Error generating commit message via API:", apiError);
                            toast.error("Could not generate commit message suggestion. Using default.");
                        }
                    }
                    setGeneratedCommitMsg(commitMessage);
                } catch (error) {
                    console.error("[Hook] Async: Error during commit preparation:", error);
                    toast.error(`Error preparing commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    setGeneratedCommitMsg('Error fetching suggestion - Update files');
                } finally {
                    setIsFetchingCommitMsg(false);
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [stagedFiles, isCommitting, isFetchingCommitMsg]);

    const handleConfirmMultiFileCommit = useCallback(async (commitMessage: string) => {
        console.log('[Hook] Triggered handleConfirmMultiFileCommit with message:', commitMessage);
        if (!commitMessage.trim()) {
            toast.error("Commit message cannot be empty.");
            return;
        }
        if (isCommitting) return;

        setIsCommitting(true);
        const commitToastId = toast.loading("Committing staged files...");

        console.log('[Hook] Preparing files to commit...');
        const filesToCommit: StagedFileCommitDetails[] = Array.from(stagedFiles.entries())
            .map(([path, { content }]) => {
                let contentToSend: string;
                let encoding: 'base64' | 'utf-8';
                if (content instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(content);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    contentToSend = btoa(binary);
                    encoding = 'base64';
                } else {
                    contentToSend = content;
                    encoding = 'utf-8';
                }
                return { path, content: contentToSend, encoding };
            });

        console.log(`[Hook] Prepared ${filesToCommit.length} files:`, filesToCommit.map(f => f.path));

        try {
            console.log('[Hook] Calling commitMultipleFiles server action...');
            const result = await commitMultipleFiles(filesToCommit, commitMessage);

            if (result.success) {
                toast.success("Commit created successfully!", {
                    id: commitToastId,
                    description: `Commit URL: ${result.commitUrl || 'N/A'}`,
                    duration: 5000,
                });
                setStagedFiles(new Map());
                setCommitModalOpen(false);
                // Call the success callback if provided
                onCommitSuccess?.();
            } else {
                console.error("[Hook] Commit failed:", result.error);
                toast.error(`Commit failed: ${result.error || 'Unknown error'}`, {
                    id: commitToastId,
                    duration: 8000,
                });
                 throw new Error(result.error || 'Unknown commit error');
            }
        } catch (error) {
            console.error("[Hook] Error calling commitMultipleFiles action:", error);
            toast.error(`Commit failed: ${error instanceof Error ? error.message : 'Client-side error'}`, { id: commitToastId });
             throw error;
        } finally {
            setIsCommitting(false);
        }
    }, [stagedFiles, isCommitting, onCommitSuccess]); // Add onCommitSuccess to dependencies

     const clearStagedFiles = useCallback(() => {
        setStagedFiles(new Map());
    }, []);

    return {
        stagedFiles,
        isCommitting,
        commitModalOpen,
        generatedCommitMsg,
        stagedPathsForModal,
        isFetchingCommitMsg,
        handleFileDrop,
        setCommitModalOpen,
        handleConfirmMultiFileCommit,
        clearStagedFiles,
    };
}
