# GitSync - Implementation Plan (V2)

## Overview
This plan guides the implementation of a drag-and-drop multi-file commit workflow using the Git Data API and Google AI for commit message generation. It integrates with the existing FileTree component and preserves the editor's single-file logic.

### Phase 1: Setup & Dependencies

1. Install new packages:
   ```bash
   npm install react-dropzone @google/generative-ai jsdiff
   ```
2. Ensure `octokit`, `@tiptap/react`, `shadcn-ui`, and existing dependencies are installed.

### Phase 2: Layout & UI Adjustments

3. Modify `src/app/notes/page.tsx`:
   - Wrap the `<FileTree>` panel `<div>` in a dropzone (`useDropzone`) to capture dropped files.
   - Preserve existing `ResizablePanelGroup` sizes; the editor panel remains collapsible (unchanged).
4. Add state in `notes/page.tsx`:
   ```ts
   const [stagedFiles, setStagedFiles] = useState<
     Map<string, { content: ArrayBuffer | string }>
   >(new Map());
   ```
5. Below the `ResizablePanelGroup`, render staged files list when `stagedFiles.size > 0`:
   ```tsx
   {stagedFiles.size > 0 && (
     <div className="p-4 border-t">
       <h3 className="font-semibold mb-2">Staged Files</h3>
       <ul>{Array.from(stagedFiles.keys()).map(path => <li key={path}>{path}</li>)}</ul>
       <Button onClick={() => setStagedFiles(new Map())}>Clear Staged</Button>
     </div>
   )}
   ```

### Phase 3: Drag & Drop Logic in FileTree

6. In `src/components/FileTree.tsx` (or its `RenderTreeItem`):
   - Import `useDropzone` and wrap each folder `<li>` node with drop handlers.
   - Capture the folder path from `item.path` when onDrop occurs:
     ```ts
     const { getRootProps } = useDropzone({
       onDrop: files => handleFileDrop(files, item.path),
     });
     ```
7. In parent (`notes/page.tsx`), define `handleFileDrop(files, targetFolderPath)`:
   ```ts
   function handleFileDrop(files: File[], folder: string) {
     files.forEach(file => {
       const reader = new FileReader();
       reader.onload = () => {
         setStagedFiles(prev => {
           const m = new Map(prev);
           const relPath = folder ? `${folder}/${file.name}` : file.name;
           m.set(relPath, { content: reader.result! });
           return m;
         });
       };
       reader.readAsArrayBuffer(file);
     });
   }
   ```

### Phase 4: Commit Message Generation

8. Create `src/app/api/generate-commit/route.ts`:
   ```ts
   import { GoogleGenerativeAI } from '@google/generative-ai';
   export async function POST(request) {
     const { diff } = await request.json();
     const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
     const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
     const prompt = `Generate a concise Git commit message from diff:\n\`diff\n${diff}\n\``;
     const result = await model.generateContent(prompt);
     const text = await result.response.text();
     return new Response(JSON.stringify({ message: text.trim() }), { status: 200 });
   }
   ```

### Phase 5: Git Data API Commit Action

9. In `src/lib/actions/githubApi.ts`, add:
   ```ts
   export async function commitMultipleFiles(
     files: { path: string; content: ArrayBuffer | string }[],
     commitMessage: string
   ) { /* implement Git Data API flow: get ref, blobs, tree, commit, updateRef */ }
   ```
   - Use `getUserOctokit()` and `checkUserConnectionStatus()`.
   - Steps:
     1. Get default branch and latest commit SHA.
     2. Get base tree SHA.
     3. Create blob for each file (Base64 content).
     4. Create new tree with blob SHAs.
     5. Create commit with new tree and parent commit.
     6. Update branch ref to new commit.

### Phase 6: Commit Workflow Frontend

10. In `notes/page.tsx`, add a `keydown` listener in `useEffect`:
    ```ts
    useEffect(() => {
      const onKey = async (e: KeyboardEvent) => {
        if ((e.ctrlKey||e.metaKey) && e.key==='s' && stagedFiles.size) {
          e.preventDefault();
          // 1) Fetch current content & compute diffs (jsdiff)
          // 2) POST diff to /api/generate-commit
          // 3) Open CommitMessageModal with message & stagedFiles list
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [stagedFiles]);
    ```
11. Compute combined diff:
    ```ts
    const patches = [];
    for (const [path, {content}] of stagedFiles) {
      const orig = (await getFileContent(path))?.content || '';
      const text = content instanceof ArrayBuffer
        ? new TextDecoder().decode(content)
        : content;
      patches.push(jsdiff.createPatch(path, orig, text));
    }
    const combinedDiff = patches.join('\n');
    ```

### Phase 7: Commit Confirmation & Execution

12. Pass `combinedDiff` to `/api/generate-commit`, store returned `message` and call `<CommitMessageModal open message={message} stagedPaths={...} />`.
13. In `handleConfirmCommit(msg)` in `notes/page.tsx`:
    ```ts
    const files = Array.from(stagedFiles.entries()).map(([path,{content}]) => ({ path, content }));
    const result = await commitMultipleFiles(files, msg);
    if (result.success) {
      toast.success('Commit created');
      setStagedFiles(new Map());
      setIsCommitModalOpen(false);
    } else {
      toast.error(result.error);
    }
    ```

### Phase 8: Finalization

14. Do *not* modify existing `Editor.tsx` or its save flow.
15. Add loading states and error handling for each async step.
16. Test end-to-end: drag/drop in nested folders, Ctrl+S, modal, commit on GitHub.
17. Update documentation and remove any stale code paths if needed.

---
*This plan ensures a clear, step-by-step path for implementing V2 without disrupting the existing editor logic.* 